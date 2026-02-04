// Ollama model interface
export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

// Tool definitions for Ollama function calling
export const webSearchTool = {
  type: 'function',
  function: {
    name: 'webSearch',
    description: 'Performs a web search for the given query using Ollama Cloud.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query string.' },
      },
      required: ['query'],
    },
  },
};

export const webFetchTool = {
  type: 'function',
  function: {
    name: 'webFetch',
    description: 'Fetches and extracts content from a single URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'A single URL to fetch.' },
      },
      required: ['url'],
    },
  },
};

// Chat message types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  thinking?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  function: {
    name: string;
    arguments: Record<string, any>;
  };
}

// Chat request payload
export interface ChatPayload {
  model: string;
  messages: ChatMessage[];
  tools?: any[];
  stream?: boolean;
}

// Chat chunk for streaming
export interface ChatChunk {
  content?: string;
  thinking?: string;
  tool_calls?: ToolCall[];
  done: boolean;
  error?: string;
}

// Academic source from search
export interface AcademicSource {
  title: string;
  authors: string[];
  journal: string;
  year: number;
  doi: string;
  abstract: string;
  url: string;
  source: 'pubmed' | 'scholar' | 'web';
}

// Research plan
export interface ResearchPlan {
  sections: {
    title: string;
    description: string;
  }[];
}

// Research session state
export interface ResearchState {
  id: string;
  chatId: string;
  status: 'pending' | 'running' | 'paused' | 'cancelled' | 'completed';
  query: string;
  plan: ResearchPlan | null;
  currentStep: number;
  sources: AcademicSource[];
  reportContent: string;
}

// Research update event
export interface ResearchUpdate {
  event_type:
    | 'status'
    | 'plan_created'
    | 'research_started'
    | 'tool_start'
    | 'source_found'
    | 'report_chunk'
    | 'completed'
    | 'error'
    | 'paused'
    | 'cancelled';
  message?: string;
  data?: any;
}
