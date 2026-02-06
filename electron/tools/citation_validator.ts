/**
 * Citation Validator using Semantic Scholar API
 * Validates DOIs and fetches accurate bibliographic information
 */

import { getSetting } from '../db';

export interface BibliographicInfo {
  doi: string;
  title: string;
  authors: string[];
  authorShort: string; // "Kim et al." or "Kim & Park" or "Kim"
  year: number;
  journal: string;
  url: string;
  isValid: boolean;
}

// DOI regex pattern
const DOI_REGEX = /10\.\d{4,}\/[^\s<>")\]]+/g;

// Semantic Scholar API base URL
const SEMANTIC_SCHOLAR_API = 'https://api.semanticscholar.org/graph/v1/paper';

// Cache for validated DOIs to avoid repeated API calls
const validationCache = new Map<string, BibliographicInfo>();

/**
 * Get Semantic Scholar API key from settings
 */
function getSemanticScholarApiKey(): string {
  return getSetting('semanticScholarApiKey') || '';
}

/**
 * Check if citation validation is enabled in settings
 * Default: false (disabled)
 */
function isValidationEnabled(): boolean {
  const setting = getSetting('enableCitationValidation');
  return setting === 'true' || setting === '1';
}

/**
 * Extract all DOIs from text
 */
export function extractDoisFromText(text: string): string[] {
  const matches = text.match(DOI_REGEX);
  if (!matches) return [];

  // Clean DOIs - remove trailing punctuation that might be captured
  const cleaned = matches.map(doi =>
    doi.replace(/[.,;:!?)+]+$/, '').trim()
  );

  return [...new Set(cleaned)];
}

/**
 * Fetch bibliographic info from Semantic Scholar API using DOI
 */
export async function fetchBibliographicInfo(doi: string): Promise<BibliographicInfo | null> {
  // Check cache first
  if (validationCache.has(doi)) {
    return validationCache.get(doi)!;
  }

  try {
    // Semantic Scholar uses DOI:{doi} format for lookup
    const fields = 'title,authors,year,venue,externalIds';
    let url = `${SEMANTIC_SCHOLAR_API}/DOI:${encodeURIComponent(doi)}?fields=${fields}`;

    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

    // Add API key if available
    const apiKey = getSemanticScholarApiKey();
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[CitationValidator] DOI not found in Semantic Scholar: ${doi}`);
      } else {
        console.error(`[CitationValidator] Semantic Scholar error ${response.status} for DOI: ${doi}`);
      }
      return null;
    }

    const data = await response.json();

    // Extract authors
    const authors: string[] = (data.authors || [])
      .map((a: any) => a.name || '')
      .filter((name: string) => name.length > 0);

    // Create short author format
    let authorShort = '';
    if (authors.length === 0) {
      authorShort = 'Unknown';
    } else if (authors.length === 1) {
      authorShort = getLastName(authors[0]);
    } else if (authors.length === 2) {
      authorShort = `${getLastName(authors[0])} & ${getLastName(authors[1])}`;
    } else {
      authorShort = `${getLastName(authors[0])} et al.`;
    }

    // Get publication year
    const year = data.year || 0;

    // Get journal/venue name
    const journal = data.venue || '';

    const bibInfo: BibliographicInfo = {
      doi,
      title: data.title || '',
      authors,
      authorShort,
      year,
      journal,
      url: `https://doi.org/${doi}`,
      isValid: true
    };

    // Cache the result
    validationCache.set(doi, bibInfo);

    return bibInfo;
  } catch (error) {
    console.error(`[CitationValidator] Error fetching DOI ${doi}:`, error);
    return null;
  }
}

/**
 * Extract last name from full name
 */
function getLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

/**
 * Validate multiple DOIs and return bibliographic info
 */
export async function validateDois(dois: string[]): Promise<Map<string, BibliographicInfo>> {
  const results = new Map<string, BibliographicInfo>();

  // Process in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < dois.length; i += batchSize) {
    const batch = dois.slice(i, i + batchSize);
    const promises = batch.map(doi => fetchBibliographicInfo(doi));
    const batchResults = await Promise.all(promises);

    for (let j = 0; j < batch.length; j++) {
      const result = batchResults[j];
      if (result) {
        results.set(batch[j], result);
      }
    }

    // Small delay between batches for rate limiting
    if (i + batchSize < dois.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Format inline citation with author and year
 * Input: "(DOI: 10.1038/xxx)" or "DOI: 10.1038/xxx"
 * Output: "(Kim et al., 2024; DOI: 10.1038/xxx)"
 */
export function formatInlineCitation(bibInfo: BibliographicInfo): string {
  return `(${bibInfo.authorShort}, ${bibInfo.year}; DOI: ${bibInfo.doi})`;
}

/**
 * Process report content to add author/year to citations
 * If validation is disabled in settings, returns original content
 */
export async function processReportCitations(content: string): Promise<{
  processedContent: string;
  validatedDois: Map<string, BibliographicInfo>;
  invalidDois: string[];
}> {
  // Check if validation is enabled (default: false)
  if (!isValidationEnabled()) {
    console.log('[CitationValidator] Validation disabled in settings, skipping DOI validation');
    return {
      processedContent: content,
      validatedDois: new Map(),
      invalidDois: []
    };
  }

  // Extract all DOIs from content
  const dois = extractDoisFromText(content);
  console.log(`[CitationValidator] Found ${dois.length} DOIs in content`);

  // Validate all DOIs
  const validatedDois = await validateDois(dois);
  const invalidDois = dois.filter(doi => !validatedDois.has(doi));

  console.log(`[CitationValidator] Validated: ${validatedDois.size}, Invalid: ${invalidDois.length}`);

  // Replace DOI citations with full format
  let processedContent = content;

  // Pattern to match various DOI citation formats:
  // (DOI: 10.xxxx/xxx), [DOI: 10.xxxx/xxx], DOI: 10.xxxx/xxx
  const citationPatterns = [
    /\(DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\)/gi,
    /\[DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\]/gi,
    /\(\[DOI:\s*(10\.\d{4,}\/[^\s<>")\]]+)\]\)/gi,
  ];

  for (const pattern of citationPatterns) {
    processedContent = processedContent.replace(pattern, (match, doi) => {
      const cleanDoi = doi.replace(/[.,;:!?)+]+$/, '').trim();
      const bibInfo = validatedDois.get(cleanDoi);
      if (bibInfo) {
        return formatInlineCitation(bibInfo);
      }
      // Keep original if not validated
      return match;
    });
  }

  // Also handle markdown link format: [DOI: 10.xxx](https://doi.org/10.xxx)
  processedContent = processedContent.replace(
    /\[DOI:\s*(10\.\d{4,}\/[^\]]+)\]\([^)]+\)/gi,
    (match, doi) => {
      const cleanDoi = doi.replace(/[.,;:!?)+]+$/, '').trim();
      const bibInfo = validatedDois.get(cleanDoi);
      if (bibInfo) {
        return `[${bibInfo.authorShort}, ${bibInfo.year}](https://doi.org/${bibInfo.doi})`;
      }
      return match;
    }
  );

  return { processedContent, validatedDois, invalidDois };
}

/**
 * Generate formatted references section
 */
export function generateReferencesSection(
  validatedDois: Map<string, BibliographicInfo>,
  language: 'en' | 'ko' = 'en'
): string {
  const title = language === 'ko' ? '## 참고문헌' : '## References';

  // Sort by author name, then year
  const sortedRefs = Array.from(validatedDois.values()).sort((a, b) => {
    const authorCompare = a.authorShort.localeCompare(b.authorShort);
    if (authorCompare !== 0) return authorCompare;
    return a.year - b.year;
  });

  const refLines = sortedRefs.map(ref => {
    const authorsStr = ref.authors.length > 0
      ? ref.authors.slice(0, 3).join(', ') + (ref.authors.length > 3 ? ', et al.' : '')
      : 'Unknown';

    return `- ${authorsStr} (${ref.year}). ${ref.title}. *${ref.journal}*. [DOI: ${ref.doi}](https://doi.org/${encodeURIComponent(ref.doi)})`;
  });

  return `${title}\n\n${refLines.join('\n\n')}\n`;
}

/**
 * Clear validation cache
 */
export function clearCache(): void {
  validationCache.clear();
}

export default {
  extractDoisFromText,
  fetchBibliographicInfo,
  validateDois,
  processReportCitations,
  generateReferencesSection,
  clearCache,
};
