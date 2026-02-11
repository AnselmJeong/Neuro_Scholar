import { AcademicSource } from '../ollama/types';
import { ollamaService } from '../ollama/service';

// PubMed E-utilities base URLs
const PUBMED_SEARCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi';
const PUBMED_FETCH_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi';
const PUBMED_SUMMARY_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi';

// DOI regex pattern
const DOI_REGEX = /10\.\d{4,}\/[^\s<>"]+/g;

export class AcademicSearchTool {
  private maxResults = 20;

  /**
   * Search for academic sources
   * Priority: PubMed first, then Google Scholar via Ollama webSearch
   * Only returns sources with DOIs
   */
  async search(query: string): Promise<AcademicSource[]> {
    const results: AcademicSource[] = [];

    // 1. Search PubMed (prioritized for biomedical)
    console.log(`[AcademicSearch] Searching PubMed for: ${query}`);
    try {
      const pubmedResults = await this.searchPubMed(query);
      results.push(...pubmedResults);
      console.log(`[AcademicSearch] PubMed returned ${pubmedResults.length} results`);
    } catch (error) {
      console.error('[AcademicSearch] PubMed search error:', error);
    }

    // 2. If not enough results, search Google Scholar via Ollama webSearch
    if (results.length < 10 && ollamaService.isInitialized()) {
      console.log(`[AcademicSearch] Searching Google Scholar for: ${query}`);
      try {
        const scholarResults = await this.searchGoogleScholar(query);
        results.push(...scholarResults);
        console.log(`[AcademicSearch] Google Scholar returned ${scholarResults.length} results`);
      } catch (error) {
        console.error('[AcademicSearch] Google Scholar search error:', error);
      }
    }

    // Filter: Only include sources with DOI
    const withDoi = results.filter((r) => r.doi && r.doi.length > 0);
    console.log(`[AcademicSearch] Total results with DOI: ${withDoi.length}`);

    // Deduplicate by DOI
    const uniqueByDoi = Array.from(new Map(withDoi.map((r) => [r.doi, r])).values());

    return uniqueByDoi.slice(0, this.maxResults);
  }

  /**
   * Build tiered PubMed queries from keywords, progressively broadening.
   * Tier 1: All keywords AND'd together (most specific)
   * Tier 2: First keyword AND (remaining keywords OR'd) (balanced)
   * Tier 3: All keywords OR'd together (broadest)
   */
  private buildTieredQueries(keywords: string[]): string[] {
    if (keywords.length === 0) return [];
    if (keywords.length === 1) return [keywords[0]];

    const quoted = keywords.map((k) => `(${k})`);
    const queries: string[] = [];

    // Tier 1: All AND
    queries.push(quoted.join(' AND '));

    // Tier 2: First keyword AND (rest OR'd)
    if (keywords.length > 2) {
      const primary = quoted[0];
      const rest = quoted.slice(1).join(' OR ');
      queries.push(`${primary} AND (${rest})`);
    }

    // Tier 3: All OR
    queries.push(quoted.join(' OR '));

    return queries;
  }

  /**
   * Search PubMed using E-utilities API with tiered query broadening.
   * Splits comma-separated keywords and tries progressively broader
   * queries until results are found.
   */
  private async searchPubMed(query: string): Promise<AcademicSource[]> {
    // Split comma-separated keywords into individual terms
    const keywords = query
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    const queries = keywords.length > 1 ? this.buildTieredQueries(keywords) : [query];

    for (const q of queries) {
      console.log(`[AcademicSearch] PubMed trying query: ${q}`);
      const results = await this.executePubMedSearch(q);
      if (results.length > 0) {
        console.log(`[AcademicSearch] PubMed got ${results.length} results with query: ${q}`);
        return results;
      }
    }

    return [];
  }

  /**
   * Execute a single PubMed search query and return parsed results.
   */
  private async executePubMedSearch(query: string): Promise<AcademicSource[]> {
    // Step 1: Search for PMIDs
    const searchUrl = new URL(PUBMED_SEARCH_URL);
    searchUrl.searchParams.set('db', 'pubmed');
    searchUrl.searchParams.set('term', query);
    searchUrl.searchParams.set('retmax', String(this.maxResults));
    searchUrl.searchParams.set('retmode', 'json');
    searchUrl.searchParams.set('sort', 'relevance');

    const searchResponse = await fetch(searchUrl.toString());
    if (!searchResponse.ok) {
      throw new Error(`PubMed search failed: ${searchResponse.status}`);
    }

    const searchData: any = await searchResponse.json();
    const pmids: string[] = searchData.esearchresult?.idlist || [];

    if (pmids.length === 0) {
      return [];
    }

    // Step 2: Fetch article summaries
    const summaryUrl = new URL(PUBMED_SUMMARY_URL);
    summaryUrl.searchParams.set('db', 'pubmed');
    summaryUrl.searchParams.set('id', pmids.join(','));
    summaryUrl.searchParams.set('retmode', 'json');

    const summaryResponse = await fetch(summaryUrl.toString());
    if (!summaryResponse.ok) {
      throw new Error(`PubMed summary failed: ${summaryResponse.status}`);
    }

    const summaryData: any = await summaryResponse.json();
    const results: AcademicSource[] = [];

    for (const pmid of pmids) {
      const article = summaryData.result?.[pmid];
      if (!article || article.error) continue;

      // Extract DOI from article IDs
      let doi = '';
      const articleIds = article.articleids || [];
      for (const idObj of articleIds) {
        if (idObj.idtype === 'doi') {
          doi = idObj.value;
          break;
        }
      }

      // Skip if no DOI
      if (!doi) continue;

      // Parse authors
      const authors: string[] = (article.authors || []).map((a: any) => a.name);

      // Get publication year
      const pubDate = article.pubdate || article.sortpubdate || '';
      const yearMatch = pubDate.match(/\d{4}/);
      const year = yearMatch ? parseInt(yearMatch[0]) : 0;

      results.push({
        title: article.title || '',
        authors,
        journal: article.fulljournalname || article.source || '',
        year,
        doi,
        abstract: '', // Summary API doesn't include abstract
        url: `https://doi.org/${doi}`,
        source: 'pubmed',
      });
    }

    // Fetch abstracts for top results
    if (results.length > 0) {
      await this.fetchPubMedAbstracts(results);
    }

    return results;
  }

  /**
   * Fetch abstracts from PubMed
   */
  private async fetchPubMedAbstracts(results: AcademicSource[]): Promise<void> {
    // Get PMIDs from DOIs
    const pmids: string[] = [];
    for (const result of results) {
      // Search for PMID by DOI
      const searchUrl = new URL(PUBMED_SEARCH_URL);
      searchUrl.searchParams.set('db', 'pubmed');
      searchUrl.searchParams.set('term', `${result.doi}[doi]`);
      searchUrl.searchParams.set('retmode', 'json');

      try {
        const response = await fetch(searchUrl.toString());
        const data: any = await response.json();
        const ids = data.esearchresult?.idlist || [];
        if (ids.length > 0) {
          pmids.push(ids[0]);
        }
      } catch {
        // Skip on error
      }
    }

    if (pmids.length === 0) return;

    // Fetch abstracts
    const fetchUrl = new URL(PUBMED_FETCH_URL);
    fetchUrl.searchParams.set('db', 'pubmed');
    fetchUrl.searchParams.set('id', pmids.join(','));
    fetchUrl.searchParams.set('rettype', 'abstract');
    fetchUrl.searchParams.set('retmode', 'text');

    try {
      const response = await fetch(fetchUrl.toString());
      const text = await response.text();

      // Parse abstracts (very basic parsing)
      // Each article is separated by blank lines
      const articles = text.split(/\n\n\d+\./);

      for (let i = 0; i < Math.min(articles.length, results.length); i++) {
        // Extract abstract section
        const abstractMatch = articles[i].match(/(?:Abstract|ABSTRACT)\s*([\s\S]*?)(?=\n\n|PMID:|$)/i);
        if (abstractMatch) {
          results[i].abstract = abstractMatch[1].trim().slice(0, 1000);
        }
      }
    } catch (error) {
      console.error('[AcademicSearch] Failed to fetch abstracts:', error);
    }
  }

  /**
   * Search Google Scholar via Ollama Cloud webSearch
   */
  private async searchGoogleScholar(query: string): Promise<AcademicSource[]> {
    // Construct a scholar-focused query — use keywords directly without quoting the entire phrase
    const scholarQuery = `${query} academic research paper`;

    try {
      const searchResult = await ollamaService.webSearch(scholarQuery);
      const results: AcademicSource[] = [];

      // Parse search results
      const items = searchResult?.results || searchResult?.webPages?.value || [];

      for (const item of items) {
        const title = item.title || item.name || '';
        const snippet = item.snippet || item.description || '';
        const url = item.url || item.link || '';

        // Extract DOI from URL or snippet
        const doiMatches = (url + ' ' + snippet).match(DOI_REGEX);
        const doi = doiMatches ? doiMatches[0] : '';

        // Skip if no DOI
        if (!doi) continue;

        // Try to extract year from snippet
        const yearMatch = snippet.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : 0;

        results.push({
          title: title.replace(/\s*-\s*Google Scholar.*$/, ''),
          authors: [], // Can't reliably extract from search
          journal: '',
          year,
          doi,
          abstract: snippet,
          url: `https://doi.org/${doi}`,
          source: 'scholar',
        });
      }

      return results;
    } catch (error) {
      console.error('[AcademicSearch] Scholar search error:', error);
      return [];
    }
  }

  /**
   * Validate and resolve DOI
   */
  async validateDoi(doi: string): Promise<boolean> {
    try {
      const response = await fetch(`https://doi.org/api/handles/${doi}`, {
        method: 'HEAD',
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Extract DOIs from text
   */
  extractDois(text: string): string[] {
    const matches = text.match(DOI_REGEX);
    return matches ? [...new Set(matches)] : [];
  }
}

export default AcademicSearchTool;
