import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';
import { ollamaService } from '../ollama/service';
import { AcademicSearchTool } from '../tools/academic_search';
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
9. 한국어로 작성하되, DOI 형식과 학술 용어는 영어 유지

인용 형식 예시:
"치료 저항성 우울증에서 해마 용적 감소가 일관되게 관찰되었으나 (DOI: 10.1016/j.biopsych.2021.02.123), 인과관계는 아직 불명확하다 (DOI: 10.1038/s41593-2022-01234)."`
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
   * Research a single section
   */
  private async researchSection(
    section: { title: string; description: string },
    originalQuery: string,
    model: string,
    language: ReportLanguage = 'en'
  ): Promise<{ title: string; content: string; sources: AcademicSource[] }> {
    // Search for academic sources
    const searchQuery = `${section.title} ${originalQuery} psychiatry neuroscience`;
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

    const userPrompt = language === 'ko'
      ? `학술 연구 보고서의 "${section.title}" 섹션을 작성하세요.

섹션 초점: ${section.description}

사용 가능한 출처 (인라인 인용에 DOI 사용):
${sourcesContext}

마크다운 형식으로 섹션 내용을 한국어로 작성하세요. 모든 주장에는 반드시 출처 DOI를 인라인으로 인용해야 합니다.`
      : `Write the "${section.title}" section for an academic research report.

Section Focus: ${section.description}

Available Sources (use DOIs for inline citations):
${sourcesContext}

Write the section content in Markdown. Every claim must cite its source DOI inline.`;

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
    let reportContent = `# ${query}\n\n`;

    // Executive Summary
    this.sendUpdate({ event_type: 'status', message: language === 'ko' ? '요약 작성 중...' : 'Writing executive summary...' });

    const summaryPrompt = language === 'ko'
      ? `다음 주제에 대한 연구 보고서의 요약(2-3 문단)을 작성하세요: "${query}"

섹션별 주요 발견:
${sectionResults.map((s) => `## ${s.title}\n${s.content.slice(0, 500)}...`).join('\n\n')}

가장 중요한 발견에 대해 DOI를 인라인으로 포함하세요. 한국어로 작성하세요.`
      : `Write an executive summary (2-3 paragraphs) for a research report on: "${query}"

Key findings from sections:
${sectionResults.map((s) => `## ${s.title}\n${s.content.slice(0, 500)}...`).join('\n\n')}

Include key DOIs inline for the most important findings.`;

    const summaryMessages: ChatMessage[] = [
      { role: 'system', content: SYNTHESIS_PROMPTS[language] },
      { role: 'user', content: summaryPrompt },
    ];

    const summaryResponse = await ollamaService.chat({ model, messages: summaryMessages });
    const summaryTitle = language === 'ko' ? '## 요약' : '## Executive Summary';
    reportContent += `${summaryTitle}\n\n${summaryResponse.content}\n\n`;

    this.sendUpdate({ event_type: 'report_chunk', data: { chunk: reportContent } });
    this.activeSession!.reportContent = reportContent;

    // Add sections
    for (const section of sectionResults) {
      await this.checkPauseCancel();

      const sectionContent = `## ${section.title}\n\n${section.content}\n\n`;
      reportContent += sectionContent;

      this.sendUpdate({ event_type: 'report_chunk', data: { chunk: sectionContent } });
      this.activeSession!.reportContent = reportContent;
    }

    // References section (DOIs only)
    const allSources = sectionResults.flatMap((s) => s.sources);
    const uniqueDois = [...new Set(allSources.map((s) => s.doi))];

    const referencesTitle = language === 'ko' ? '## 참고문헌' : '## References';
    reportContent += `${referencesTitle}\n\n`;
    for (const doi of uniqueDois) {
      const source = allSources.find((s) => s.doi === doi);
      if (source) {
        reportContent += `- ${source.title}. ${source.journal} (${source.year}). DOI: ${doi}\n`;
      }
    }

    this.activeSession!.reportContent = reportContent;
    this.sendUpdate({ event_type: 'report_chunk', data: { chunk: reportContent, final: true } });
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
