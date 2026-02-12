import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { ollamaService } from '../ollama/service';
import { AcademicSearchTool } from '../tools/academic_search';
import {
  filterAndFormatCitationsWithSourceDois,
  generateReferencesSection,
  normalizeDoi,
  ReferenceFallbackInfo,
} from '../tools/citation_validator';
import {
  ResearchPlan,
  ResearchState,
  ResearchUpdate,
  AcademicSource,
  ChatMessage,
} from '../ollama/types';
import { getMainWindow } from '../main';

// Language type
type ReportLanguage = 'en' | 'ko';

// Academic research system prompts by language
const PLANNING_PROMPTS: Record<ReportLanguage, string> = {
  en: `You are an expert research planner specializing in psychiatry and neuroscience.
Given a research query, create a detailed Table of Contents for a comprehensive academic review.

Requirements:
1. Focus on psychiatry, neuroscience, and related biomedical fields
2. Each section should be specific enough to guide targeted literature searches
3. Include sections for: Background/Context, Key Findings, Methodological Considerations, Clinical Implications
4. Use professional academic terminology
5. Aim for 4-6 focused sections
6. IMPORTANT: Do NOT include "Executive Summary", "Summary", "Abstract", "References", or "Bibliography" sections - these are generated automatically

Respond with a JSON object in this exact format:
{
  "sections": [
    {"title": "Section Title", "description": "Brief description of what this section covers"}
  ]
}`,
  ko: `당신은 정신의학과 신경과학을 전문으로 하는 연구 계획 전문가입니다.
연구 질문이 주어지면, 종합적인 학술 리뷰를 위한 상세한 목차를 작성하세요.

요구사항:
1. 정신의학, 신경과학 및 관련 생의학 분야에 집중
2. 각 섹션은 타겟 문헌 검색을 안내할 수 있을 정도로 구체적이어야 함
3. 다음 섹션 포함: 배경/맥락, 주요 연구 결과, 방법론적 고려사항, 임상적 함의
4. 전문적인 학술 용어 사용
5. 4-6개의 집중된 섹션 목표
6. 중요: "요약", "Executive Summary", "참고문헌", "References" 섹션은 포함하지 마세요 - 자동으로 생성됩니다
7. CRITICAL: 섹션 제목과 설명을 반드시 한국어로 작성하세요

다음 형식의 JSON 객체로 응답하세요:
{
  "sections": [
    {"title": "섹션 제목", "description": "이 섹션에서 다루는 내용에 대한 간략한 설명"}
  ]
}`
};

const SYNTHESIS_PROMPTS: Record<ReportLanguage, string> = {
  en: `You are a senior academic researcher writing for psychiatry and neuroscience professionals.

CRITICAL REQUIREMENTS:
1. Use professional medical/scientific terminology appropriate for peer-reviewed literature
2. Prioritize accuracy and precision over accessibility
3. Every factual claim MUST include an inline DOI citation in this exact format: (DOI: 10.xxxx/xxxxx)
4. Do NOT use footnotes or reference numbers - insert DOI directly at the point of citation
5. Synthesize findings across sources; do not simply summarize each source
6. If sources contradict each other, acknowledge the controversy with both DOIs
7. Focus on methodology quality and evidence strength
8. Write in formal academic prose suitable for a review article
9. CRITICAL: Do NOT include section titles, headers, or markdown formatting (##) in your response - write only the body content

DOI ACCURACY (EXTREMELY IMPORTANT):
- ONLY use DOIs that are explicitly provided in the source list
- NEVER fabricate, guess, or modify DOIs
- If unsure about a DOI, omit the citation rather than inventing one
- Copy DOIs exactly as provided - character for character

Example citation format:
"Hippocampal volume reduction has been consistently observed in treatment-resistant depression (DOI: 10.1016/j.biopsych.2021.02.123), though the causal relationship remains unclear (DOI: 10.1038/s41593-2022-01234)."`,
  ko: `당신은 정신의학 및 신경과학 전문가를 위해 글을 쓰는 선임 학술 연구자입니다.

중요 요구사항:
1. 동료 심사 문헌에 적합한 전문 의학/과학 용어 사용
2. 접근성보다 정확성과 정밀성 우선
3. 모든 사실적 주장에는 반드시 다음 형식의 인라인 DOI 인용 포함: (DOI: 10.xxxx/xxxxx)
4. 각주나 참조 번호 사용 금지 - 인용 시점에 DOI 직접 삽입
5. 각 출처를 단순히 요약하지 말고 여러 출처의 결과를 종합
6. 출처 간 상충하는 내용이 있으면 양쪽 DOI와 함께 논쟁점 인정
7. 방법론의 질과 증거의 강도에 집중
8. 리뷰 논문에 적합한 공식적인 학술 문체로 작성
9. CRITICAL: 보고서의 모든 본문을 반드시 한국어로 작성하세요 (Write all content in Korean)
10. DOI, 논문 제목, 저자명은 원문(영어) 그대로 유지하세요
11. CRITICAL: Do NOT include section titles, headers, or markdown formatting (##) in your response - write only the body content

DOI 정확성 (매우 중요):
- 반드시 출처 목록에 명시된 DOI만 사용하세요
- DOI를 절대로 만들어내거나, 추측하거나, 수정하지 마세요
- DOI가 확실하지 않으면 인용을 생략하세요
- DOI를 글자 그대로 정확히 복사하세요

인용 형식 예시:
"항우울제 치료와 관련하여 해마 부피 감소가 일관되게 관찰되었다 (DOI: 10.1016/j.biopsych.2021.02.123), 그러나 인과 관계는 여전히 불분명하다 (DOI: 10.1038/s41593-2022-01234)."`,
};

// Prompts for generating academic search keywords per section
const KEYWORD_PROMPTS: Record<ReportLanguage, string> = {
  en: `You are an expert academic search specialist. Given a research section title and description, generate exactly 4 most important search keywords for finding relevant academic papers.

Requirements:
1. Select ONLY the 4 most critical keywords that best represent the core concepts
2. Order keywords by importance — put the MOST IMPORTANT keyword first
3. Use scientific/medical terminology appropriate for PubMed searches
4. Include specific technical terms, drug names, brain regions, or methodologies when relevant
5. Return ONLY a comma-separated list of 4 keywords (no explanations, no bullet points)
6. Prioritize precision over quantity - 4 carefully chosen keywords are better than many generic ones

Example output format:
neuroplasticity, structural MRI, depression treatment, BDNF`,
  ko: `당신은 학술 검색 전문가입니다. 연구 섹션 제목과 설명이 주어지면, 관련 학술 논문을 찾기 위한 가장 중요한 4개의 검색 키워드를 생성하세요.

요구사항:
1. 핵심 개념을 가장 잘 대표하는 4개의 가장 중요한 키워드만 선택하세요
2. 키워드를 중요도 순으로 정렬하세요 — 가장 중요한 키워드를 첫 번째에 놓으세요
3. PubMed 검색에 적합한 과학/의학 용어를 사용하세요
4. 관련된 기술 용어, 약물명, 뇌 영역, 또는 방법론을 포함하세요
5. 오직 쉼표로 구분된 4개 키워드 목록만 반환하세요 (설명 없음, 글머리 기호 없음)
6. 양보다 질을 우선시하세요 - 여러 개의 일반적인 키워드보다 4개의 신중하게 선택된 키워드가 더 좋습니다

출력 형식 예시:
neuroplasticity, structural MRI, depression treatment, BDNF`,
};

export class ResearchOrchestrator {
  private academicSearch: AcademicSearchTool;
  private activeSession: ResearchState | null = null;
  private abortController: AbortController | null = null;
  private isPaused = false;

  constructor() {
    this.academicSearch = new AcademicSearchTool();
  }

  /**
   * Remove any LLM-generated references/bibliography block from section text.
   * The app generates a single canonical References section at the end.
   */
  private stripInlineReferencesBlock(text: string): string {
    const lines = text.split('\n');
    const markerIndex = lines.findIndex((line) => {
      const t = line.trim().toLowerCase();
      return (
        t === 'references' ||
        t === 'bibliography' ||
        t === '참고문헌' ||
        t === 'works cited' ||
        t.startsWith('references:') ||
        t.startsWith('bibliography:') ||
        t.startsWith('참고문헌:')
      );
    });

    if (markerIndex === -1) return text;
    return lines.slice(0, markerIndex).join('\n').trim();
  }

  /**
   * Start a new research session
   */
  async startResearch(
    chatId: string,
    query: string,
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<string> {
    const db = getDb();
    const sessionId = uuidv4();
    const now = new Date().toISOString();

    // Initialize abort controller
    this.abortController = new AbortController();
    this.isPaused = false;

    // Create research session
    db.prepare(
      `INSERT INTO research_sessions (id, chat_id, status, query, created_at, updated_at)
       VALUES (?, ?, 'running', ?, ?, ?)`
    ).run(sessionId, chatId, query, now, now);

    // Initialize active session state
    this.activeSession = {
      id: sessionId,
      chatId,
      status: 'running',
      query,
      plan: null,
      currentStep: 0,
      sources: [],
      reportContent: '',
    };

    // Run research in background
    this.runResearch(sessionId, chatId, query, model, language).catch((error) => {
      console.error('[Research] Error:', error);
      this.sendUpdate({ event_type: 'error', message: error.message });
    });

    return sessionId;
  }

  /**
   * Main research workflow
   */
  private async runResearch(
    sessionId: string,
    chatId: string,
    query: string,
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<void> {
    const db = getDb();

    try {
      // Check for uploaded files to include as context
      const files = db
        .prepare('SELECT filename, content FROM uploaded_files WHERE chat_id = ?')
        .all(chatId) as { filename: string; content: string }[];

      let enhancedQuery = query;
      if (files.length > 0) {
        const fileContext = files
          .map((f) => `--- ${f.filename} ---\n${f.content.slice(0, 2000)}`)
          .join('\n\n');
        enhancedQuery = `${query}\n\nContext from uploaded documents:\n${fileContext}`;
      }

      // === Phase 1: Planning ===
      this.sendUpdate({ event_type: 'status', message: language === 'ko' ? '연구 계획 작성 중...' : 'Creating research plan...' });

      const plan = await this.createPlan(enhancedQuery, model, language);
      if (!plan) {
        throw new Error('Failed to create research plan');
      }

      // Save plan to database
      db.prepare('UPDATE research_sessions SET plan = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(plan),
        new Date().toISOString(),
        sessionId
      );

      this.activeSession!.plan = plan;
      this.sendUpdate({
        event_type: 'plan_created',
        data: {
          toc: plan.sections.map((s) => s.title),
          full_plan: plan,
        },
      });

      // === Phase 2: Research (Parallel Section Research) ===
      const sectionResults: { title: string; content: string; sources: AcademicSource[] }[] = [];

      for (let i = 0; i < plan.sections.length; i++) {
        // Check for pause/cancel
        await this.checkPauseCancel();

        const section = plan.sections[i];
        this.activeSession!.currentStep = i;

        db.prepare('UPDATE research_sessions SET current_step = ?, updated_at = ? WHERE id = ?').run(
          i,
          new Date().toISOString(),
          sessionId
        );

        this.sendUpdate({
          event_type: 'research_started',
          data: { section_index: i, topic: section.title },
        });

        const result = await this.researchSection(section, query, model, language);
        sectionResults.push(result);
      }

      // Check for pause/cancel before synthesis
      await this.checkPauseCancel();

      // === Phase 3: Synthesis ===
      this.sendUpdate({ event_type: 'status', message: language === 'ko' ? '보고서 종합 중...' : 'Synthesizing report...' });

      await this.synthesizeReport(query, sectionResults, model, language);

      // === Complete ===
      db.prepare('UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?').run(
        'completed',
        new Date().toISOString(),
        sessionId
      );

      this.sendUpdate({
        event_type: 'completed',
        data: { report_preview: this.activeSession!.reportContent.slice(0, 500) },
      });

      // Save final report as message
      const reportMessageId = uuidv4();
      db.prepare(
        `INSERT INTO messages (id, chat_id, role, content, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)`
      ).run(
        reportMessageId,
        chatId,
        this.activeSession!.reportContent,
        JSON.stringify({ sources: this.activeSession!.sources }),
        new Date().toISOString()
      );

      // Generate title
      await this.generateTitle(chatId, query, model);
    } catch (error: any) {
      if (error.name === 'AbortError' || error.message === 'Research cancelled') {
        db.prepare('UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?').run(
          'cancelled',
          new Date().toISOString(),
          sessionId
        );
        this.sendUpdate({ event_type: 'cancelled', message: 'Research cancelled by user' });
      } else {
        db.prepare('UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?').run(
          'completed',
          new Date().toISOString(),
          sessionId
        );
        throw error;
      }
    } finally {
      this.activeSession = null;
      this.abortController = null;
    }
  }

  /**
   * Create research plan using LLM
   */
  private async createPlan(query: string, model: string, language: ReportLanguage = 'en'): Promise<ResearchPlan | null> {
    const messages: ChatMessage[] = [
      { role: 'system', content: PLANNING_PROMPTS[language] },
      { role: 'user', content: language === 'ko'
        ? `다음 주제에 대한 연구 계획을 작성하세요: ${query}`
        : `Create a research plan for: ${query}` },
    ];

    const response = await ollamaService.chat({ model, messages });

    // Parse JSON from response
    try {
      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as ResearchPlan;
      }
    } catch (e) {
      console.error('[Research] Failed to parse plan:', e);
    }

    return null;
  }

  /**
   * Generate search keywords for a section using LLM
   * Returns null if generation fails (for fallback handling)
   */
  private async generateSearchKeywords(
    section: { title: string; description: string },
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<string | null> {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: KEYWORD_PROMPTS[language] },
        { role: 'user', content: language === 'ko'
          ? `섹션 제목: ${section.title}\n섹션 설명: ${section.description}\n\n이 주제로 학술 논문을 검색할 키워드를 생성하세요.`
          : `Section Title: ${section.title}\nSection Description: ${section.description}\n\nGenerate search keywords for finding academic papers on this topic.` },
      ];

      const response = await ollamaService.chat({ model, messages });

      // Extract keywords from response (should be comma-separated)
      const keywords = response.content
        .replace(/\n/g, ', ')  // Replace newlines with commas
        .replace(/\s+/g, ' ')  // Normalize whitespace
        .trim();

      console.log(`[Research] Generated keywords for "${section.title}": ${keywords}`);
      return keywords;
    } catch (error) {
      console.error(`[Research] Failed to generate keywords for "${section.title}":`, error);
      return null; // Return null to trigger fallback
    }
  }

  /**
   * Research a single section
   */
  private async researchSection(
    section: { title: string; description: string },
    originalQuery: string,
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<{ title: string; content: string; sources: AcademicSource[] }> {
    // Generate search keywords using LLM
    this.sendUpdate({
      event_type: 'tool_start',
      data: { tool: 'keyword_generation', section: section.title },
    });

    const keywords = await this.generateSearchKeywords(section, model, language);

    // Fallback: use section title + description if keyword generation failed
    const searchTerms = keywords || `${section.title} ${section.description}`;

    // Search for academic sources using generated keywords only
    const searchQuery = searchTerms;
    this.sendUpdate({
      event_type: 'tool_start',
      data: { tool: 'academic_search', query: searchQuery },
    });

    const sources = await this.academicSearch.search(searchQuery);

    // Report found sources
    for (const source of sources) {
      this.activeSession!.sources.push(source);
      this.sendUpdate({
        event_type: 'source_found',
        data: {
          title: source.title,
          url: source.url,
          doi: source.doi,
          journal: source.journal,
        },
      });
    }

    // Synthesize section content
    const content = await this.synthesizeSection(section, sources, model, language);

    return { title: section.title, content, sources };
  }

  /**
   * Synthesize a single section
   */
  private async synthesizeSection(
    section: { title: string; description: string },
    sources: AcademicSource[],
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<string> {
    const sourcesContext = sources
      .map(
        (s) =>
          `- ${s.title} (DOI: ${s.doi})
  Authors: ${s.authors.join(', ') || 'N/A'}
  Journal: ${s.journal} (${s.year})
  Abstract: ${s.abstract || 'N/A'}`
      )
      .join('\n\n');

    // Create a simple DOI list for constraint
    const doiList = sources.map(s => s.doi).join(', ');

    const userPrompt = language === 'ko'
      ? `학술 연구 보고서의 "${section.title}" 섹션을 작성하세요.

섹션 초점: ${section.description}

사용 가능한 출처 (인라인 인용에 DOI 사용):
${sourcesContext}

허용된 DOI 목록: ${doiList}

CRITICAL INSTRUCTIONS (반드시 지켜야 함):
1. ONLY use DOIs from the list above - 반드시 위 목록에 있는 DOI만 사용하세요
2. Do NOT fabricate or modify DOIs - DOI를 만들어내거나 수정하지 마세요
3. Citation format: (DOI: 10.xxxx/xxxxx) - 인용 형식 준수
4. Every claim must cite its source DOI inline - 모든 주장은 인라인 DOI 인용 필요
5. LANGUAGE: 반드시 한국어로 작성하세요 (Write in Korean only)
6. 모든 본문 내용은 한국어로 작성하되, DOI와 논문 제목은 원문(영어) 그대로 유지하세요`
      : `Write the "${section.title}" section for an academic research report.

Section Focus: ${section.description}

Available Sources (use DOIs for inline citations):
${sourcesContext}

Allowed DOI list: ${doiList}

CRITICAL INSTRUCTIONS:
1. ONLY use DOIs from the list above
2. Do NOT fabricate or modify DOIs
3. Citation format: (DOI: 10.xxxx/xxxxx)
4. Every claim must cite its source DOI inline`;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYNTHESIS_PROMPTS[language] },
      { role: 'user', content: userPrompt },
    ];

    const response = await ollamaService.chat({ model, messages });
    return response.content;
  }

  /**
   * Synthesize final report
   */
  private async synthesizeReport(
    query: string,
    sectionResults: { title: string; content: string; sources: AcademicSource[] }[],
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<void> {
    // Build report content with streaming
    // Note: Do NOT include the user query as the report title
    let reportContent = '';

    // Filter out sections that are duplicates of Executive Summary or References
    // These are generated separately by this function
    const excludedTitles = [
      'executive summary', '요약', 'summary',
      'references', '참고문헌', 'bibliography'
    ];
    const filteredSections = sectionResults.filter(
      (s) => !excludedTitles.some(t => s.title.toLowerCase().includes(t))
    );

    // Collect all sources and their DOIs for citation context
    const allSources = sectionResults.flatMap((s) => s.sources);

    // If no verified search sources were found, do not produce a hallucinated citation report.
    if (allSources.length === 0) {
      const noSourcesReport = language === 'ko'
        ? `## 보고서 생성 불가\n\n검색 단계에서 DOI가 확인된 문헌을 찾지 못해 보고서를 생성할 수 없습니다. 검색 질의어를 더 구체화하거나 범위를 넓혀 다시 시도하세요.\n`
        : `## Report Unavailable\n\nNo DOI-verified sources were found during search, so a report cannot be generated safely. Please refine or broaden the query and try again.\n`;
      reportContent = noSourcesReport;
      this.sendUpdate({ event_type: 'report_chunk', data: { chunk: noSourcesReport, final: true } });
      this.activeSession!.reportContent = reportContent;
      this.activeSession!.sources = [];
      return;
    }

    const sourceDoiContext = allSources
      .map(s => `${s.doi}: ${s.authors.join(', ')} (${s.year}) - ${s.title}`)
      .join('\n');

    // Executive Summary
    this.sendUpdate({ event_type: 'status', message: language === 'ko' ? '요약 작성 중...' : 'Writing executive summary...' });

    const summaryPrompt = language === 'ko'
      ? `CRITICAL: Write an executive summary (2-3 paragraphs) in KOREAN (한국어로 작성하세요) for a research report on: "${query}"

섹션별 주요 발견:
${filteredSections.map((s) => `## ${s.title}\n${s.content.slice(0, 500)}...`).join('\n\n')}

사용 가능한 DOI 목록 (반드시 이 목록의 DOI만 사용):
${sourceDoiContext}

CRITICAL INSTRUCTIONS:
1. LANGUAGE: 반드시 한국어로 작성하세요 (Write in Korean only)
2. Only use DOIs from the list above - 반드시 위 목록에 있는 DOI만 사용하세요
3. Do not fabricate DOIs - DOI를 만들어내지 마세요`
      : `Write an executive summary (2-3 paragraphs) for a research report on: "${query}"

Key findings from sections:
${filteredSections.map((s) => `## ${s.title}\n${s.content.slice(0, 500)}...`).join('\n\n')}

Available DOIs (ONLY use DOIs from this list):
${sourceDoiContext}

IMPORTANT: Only use DOIs from the list above. Do not fabricate DOIs.`;

    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: SYNTHESIS_PROMPTS[language] },
      { role: 'user', content: summaryPrompt },
    ];

    const summaryResponse = await ollamaService.chat({ model, messages: summaryMessages });
    const summaryTitle = language === 'ko' ? '## 요약' : '## Executive Summary';
    // Strip any markdown headers from summary content to prevent duplication
    const cleanSummary = this.stripInlineReferencesBlock(
      summaryResponse.content.replace(/^##?\s+.+$/gm, '').trim()
    );
    reportContent += `${summaryTitle}\n\n${cleanSummary}\n\n`;

    this.sendUpdate({ event_type: 'report_chunk', data: { chunk: reportContent } });
    this.activeSession!.reportContent = reportContent;

    // Add sections (using filtered list to avoid duplicates)
    for (const section of filteredSections) {
      await this.checkPauseCancel();

      // Strip any markdown headers from section content to prevent duplication
      const cleanContent = this.stripInlineReferencesBlock(
        section.content.replace(/^##?\s+.+$/gm, '').trim()
      );
      const sectionContent = `## ${section.title}\n\n${cleanContent}\n\n`;
      reportContent += sectionContent;

      this.sendUpdate({ event_type: 'report_chunk', data: { chunk: sectionContent } });
      this.activeSession!.reportContent = reportContent;
    }

    // === Citation Validation and Enhancement ===
    this.sendUpdate({
      event_type: 'status',
      message: language === 'ko' ? 'DOI 인용 정합성 확인 중...' : 'Validating DOI citations against searched sources...'
    });

    try {
      const fallbackByDoi = new Map<string, ReferenceFallbackInfo>();
      for (const source of allSources) {
        const sourceDoi = normalizeDoi(source.doi);
        if (!fallbackByDoi.has(sourceDoi)) {
          fallbackByDoi.set(sourceDoi, {
            authors: source.authors,
            year: source.year,
            title: source.title,
            journal: source.journal,
          });
        }
      }

      const {
        processedContent,
        citedDois,
        removedDois,
      } = filterAndFormatCitationsWithSourceDois(reportContent, fallbackByDoi);
      reportContent = processedContent;

      if (removedDois.length > 0) {
        console.log(`[Research] Removed hallucinated/non-source DOIs: ${removedDois.join(', ')}`);
      }

      const referencesSection = generateReferencesSection(
        citedDois,
        new Map(),
        fallbackByDoi,
        language
      );
      reportContent += referencesSection;
      // Send the entire processed report to replace the raw-DOI accumulated chunks on the client
      this.sendUpdate({ event_type: 'report_replace', data: { content: reportContent } });

      // Source list already constrained by search pipeline.
      this.activeSession!.sources = allSources as AcademicSource[];

    } catch (error) {
      console.error('[Research] Citation validation error:', error);
      // Fallback: no synthetic validation calls; use source-only DOI normalization path.
      const fallbackByDoi = new Map<string, ReferenceFallbackInfo>();
      for (const source of allSources) {
        const sourceDoi = normalizeDoi(source.doi);
        if (!fallbackByDoi.has(sourceDoi)) {
          fallbackByDoi.set(sourceDoi, {
            authors: source.authors,
            year: source.year,
            title: source.title,
            journal: source.journal,
          });
        }
      }
      const { processedContent, citedDois } = filterAndFormatCitationsWithSourceDois(reportContent, fallbackByDoi);
      reportContent = processedContent;
      const referencesContent = generateReferencesSection(citedDois, new Map(), fallbackByDoi, language);
      reportContent += referencesContent;
      // Send the entire processed report to replace the raw-DOI accumulated chunks on the client
      this.sendUpdate({ event_type: 'report_replace', data: { content: reportContent } });
    }

    this.activeSession!.reportContent = reportContent;
  }

  /**
   * Generate chat title from query
   */
  private async generateTitle(chatId: string, query: string, model: string): Promise<void> {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: `Generate a short (5-7 words) title for a research report about: "${query}"
Reply with ONLY the title, no quotes or extra text.`,
      },
    ];

    try {
      const response = await ollamaService.chat({ model, messages });
      const title = response.content.trim().replace(/^["']|["']$/g, '');

      const db = getDb();
      db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(
        title,
        new Date().toISOString(),
        chatId
      );

      this.sendUpdate({ event_type: 'status', data: { title_generated: title } });
    } catch (e) {
      console.error('[Research] Failed to generate title:', e);
    }
  }

  /**
   * Check for pause/cancel state
   */
  private async checkPauseCancel(): Promise<void> {
    if (this.abortController?.signal.aborted) {
      throw new Error('Research cancelled');
    }

    while (this.isPaused) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.abortController?.signal.aborted) {
        throw new Error('Research cancelled');
      }
    }
  }

  /**
   * Send update to renderer
   */
  private sendUpdate(update: ResearchUpdate): void {
    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('research-update', update);
    }
  }

  /**
   * Pause research
   */
  pause(sessionId: string): void {
    if (this.activeSession?.id === sessionId) {
      this.isPaused = true;
      const db = getDb();
      db.prepare('UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?').run(
        'paused',
        new Date().toISOString(),
        sessionId
      );
      this.sendUpdate({ event_type: 'paused', message: 'Research paused' });
    }
  }

  /**
   * Resume research
   */
  resume(sessionId: string): void {
    if (this.activeSession?.id === sessionId) {
      this.isPaused = false;
      const db = getDb();
      db.prepare('UPDATE research_sessions SET status = ?, updated_at = ? WHERE id = ?').run(
        'running',
        new Date().toISOString(),
        sessionId
      );
      this.sendUpdate({ event_type: 'status', message: 'Research resumed' });
    }
  }

  /**
   * Cancel research
   */
  cancel(sessionId: string): void {
    if (this.activeSession?.id === sessionId) {
      this.abortController?.abort();
    }
  }

  /**
   * Update query mid-research
   */
  async updateQuery(sessionId: string, newQuery: string): Promise<void> {
    if (this.activeSession?.id === sessionId) {
      // This would require re-running from current point
      // For simplicity, we'll cancel and restart
      this.cancel(sessionId);
      // The UI should handle restarting with the new query
      this.sendUpdate({
        event_type: 'status',
        message: 'Query updated. Please restart research with the new query.',
        data: { newQuery },
      });
    }
  }

  /**
   * Get current session state
   */
  getActiveSession(): ResearchState | null {
    return this.activeSession;
  }
}

// Singleton instance
export const researchOrchestrator = new ResearchOrchestrator();
export default researchOrchestrator;
