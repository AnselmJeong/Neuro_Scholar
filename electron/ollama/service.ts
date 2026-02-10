import { Ollama } from 'ollama';
import { getSetting, setSetting } from '../db';
import { ChatPayload, ChatChunk, OllamaModel } from './types';

// Ollama Cloud endpoint
const OLLAMA_CLOUD_URL = 'https://api.ollama.com';

let client: Ollama | null = null;

function createClient(apiKey?: string): Ollama {
  if (!apiKey) {
    throw new Error('Ollama Cloud API key is required');
  }

  return new Ollama({
    host: OLLAMA_CLOUD_URL,
    headers: {
      Authorization: `Bearer ${apiKey.replace(/"/g, '').trim()}`,
    },
  });
}

export const ollamaService = {
  /**
   * Initialize the Ollama client with API key from settings or env
   */
  initialize(): boolean {
    try {
      const dbKey = getSetting('ollamaApiKey');
      const envKey = process.env.OLLAMA_API_KEY || process.env.Ollama_API_KEY;
      const apiKey = dbKey || envKey;

      if (!apiKey) {
        console.log('[OllamaService] No API key found. User must configure in settings.');
        return false;
      }

      console.log('[OllamaService] Initializing with API Key from ' + (dbKey ? 'DB' : 'ENV'));
      client = createClient(apiKey);
      return true;
    } catch (e) {
      console.error('[OllamaService] Init failed:', e);
      return false;
    }
  },

  /**
   * Update the API key and reinitialize client
   */
  updateApiKey(key: string): void {
    console.log('[OllamaService] Updating API Key');
    setSetting('ollamaApiKey', key);
    client = createClient(key);
  },

  /**
   * Check if the client is initialized
   */
  isInitialized(): boolean {
    return client !== null;
  },

  /**
   * Get available models from Ollama Cloud
   */
  async getModels(): Promise<OllamaModel[]> {
    if (!client) {
      console.warn('[OllamaService] Client not initialized');
      return [];
    }

    try {
      const response = await client.list();
      return (response.models || []).map((model: any) => ({
        ...model,
        modified_at:
          typeof model.modified_at === 'string'
            ? model.modified_at
            : new Date(model.modified_at).toISOString(),
      })) as OllamaModel[];
    } catch (error) {
      console.error('[OllamaService] Error fetching models:', error);
      return [];
    }
  },

  /**
   * Chat with Ollama (streaming)
   * Returns an async generator that yields chunks
   */
  async *chatStream(payload: ChatPayload): AsyncGenerator<ChatChunk> {
    if (!client) {
      yield { error: 'Ollama client not initialized. Please set API key in settings.', done: true };
      return;
    }

    console.log(`\n--- [OllamaService] Chat Request ---`);
    console.log(`Model: ${payload.model}`);

    try {
      const messages = [...payload.messages];
      const tools = payload.tools;
      let iterationCount = 0;
      const MAX_ITERATIONS = 5;

      while (iterationCount < MAX_ITERATIONS) {
        iterationCount++;

        const response = await client.chat({
          model: payload.model,
          messages: messages as any,
          tools: tools,
          stream: true,
        });

        let assistantContent = '';
        let assistantThinking = '';
        let toolCalls: any[] = [];

        for await (const chunk of response) {
          if (chunk.message.thinking) assistantThinking += chunk.message.thinking;
          if (chunk.message.content) assistantContent += chunk.message.content;
          if (chunk.message.tool_calls) toolCalls = [...toolCalls, ...chunk.message.tool_calls];

          yield {
            content: chunk.message.content || '',
            thinking: chunk.message.thinking || '',
            tool_calls: chunk.message.tool_calls,
            done: false,
          };
        }

        // If there are tool calls, execute them
        if (toolCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: assistantContent,
            thinking: assistantThinking,
            tool_calls: toolCalls,
          } as any);

          for (const toolCall of toolCalls) {
            try {
              console.log(`[OllamaService] Executing tool: ${toolCall.function.name}`);
              let output: any;

              if (toolCall.function.name === 'webSearch') {
                // @ts-ignore - SDK method
                output = await client.webSearch({ query: toolCall.function.arguments.query });
              } else if (toolCall.function.name === 'webFetch') {
                // @ts-ignore - SDK method
                output = await client.webFetch({ url: toolCall.function.arguments.url });
              }

              messages.push({
                role: 'tool',
                content: JSON.stringify(output),
              } as any);
            } catch (toolError: any) {
              console.error(`[OllamaService] Tool Execution Error (${toolCall.function.name}):`, toolError.message || toolError);

              const errorMsg =
                toolError.status_code === 401
                  ? 'Unauthorized: Please verify your Ollama API Key in settings.'
                  : toolError.message || 'Tool execution failed';

              messages.push({
                role: 'tool',
                content: JSON.stringify({ error: errorMsg }),
              } as any);
            }
          }
          continue;
        }

        // No tool calls, we're done
        yield { done: true };
        return;
      }

      yield { error: 'Maximum tool iterations reached', done: true };
    } catch (error: any) {
      console.error('[OllamaService] Chat Error:', error);
      yield { error: error.message, done: true };
    }
  },

  /**
   * Non-streaming chat for internal use (planning, synthesis)
   */
  async chat(payload: ChatPayload): Promise<{ content: string; thinking: string }> {
    let content = '';
    let thinking = '';

    for await (const chunk of this.chatStream(payload)) {
      if (chunk.error) {
        throw new Error(chunk.error);
      }
      if (chunk.content) content += chunk.content;
      if (chunk.thinking) thinking += chunk.thinking;
    }

    return { content, thinking };
  },

  /**
   * Web search using Ollama Cloud
   */
  async webSearch(query: string): Promise<any> {
    if (!client) {
      throw new Error('Ollama client not initialized');
    }

    try {
      // @ts-ignore - SDK method
      const result = await client.webSearch({ query });
      return result;
    } catch (error: any) {
      console.error('[OllamaService] Web search error:', error);
      throw error;
    }
  },

  /**
   * Web fetch using Ollama Cloud
   */
  async webFetch(url: string): Promise<any> {
    if (!client) {
      throw new Error('Ollama client not initialized');
    }

    try {
      // @ts-ignore - SDK method
      const result = await client.webFetch({ url });
      return result;
    } catch (error: any) {
      console.error('[OllamaService] Web fetch error:', error);
      throw error;
    }
  },
};

export default ollamaService;
