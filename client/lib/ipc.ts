/**
 * IPC wrapper for Electron communication
 * Replaces HTTP API calls with IPC invocations
 */

// Type imports from electron API
import type { ElectronAPI } from '../../electron/preload';

// Get the exposed API from preload
const getAPI = (): ElectronAPI => {
  if (typeof window !== 'undefined' && window.electronAPI) {
    return window.electronAPI;
  }
  throw new Error('Electron API not available. Are you running in Electron?');
};

// Check if running in Electron
export const isElectron = (): boolean => {
  return typeof window !== 'undefined' && !!window.electronAPI;
};

/**
 * Ollama API
 */
export const ollamaApi = {
  getModels: async () => {
    return getAPI().ollama.getModels();
  },

  chat: async (payload: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    tools?: any[];
  }) => {
    return getAPI().ollama.chat(payload);
  },

  isInitialized: async () => {
    return getAPI().ollama.isInitialized();
  },
};

/**
 * Research API
 */
export const researchApi = {
  start: async (payload: { chatId: string; query: string; model: string }) => {
    return getAPI().research.start(payload);
  },

  pause: async (sessionId: string) => {
    return getAPI().research.pause(sessionId);
  },

  resume: async (sessionId: string) => {
    return getAPI().research.resume(sessionId);
  },

  cancel: async (sessionId: string) => {
    return getAPI().research.cancel(sessionId);
  },

  updateQuery: async (sessionId: string, newQuery: string) => {
    return getAPI().research.updateQuery(sessionId, newQuery);
  },
};

/**
 * Chat API
 */
export const chatApi = {
  list: async () => {
    return getAPI().chat.list();
  },

  create: async (mode: 'research' | 'chat' = 'research') => {
    return getAPI().chat.create(mode);
  },

  get: async (chatId: string) => {
    return getAPI().chat.get(chatId);
  },

  update: async (chatId: string, updates: { title?: string; mode?: 'research' | 'chat' }) => {
    return getAPI().chat.update(chatId, updates);
  },

  delete: async (chatId: string) => {
    return getAPI().chat.delete(chatId);
  },

  getMessages: async (chatId: string) => {
    return getAPI().chat.getMessages(chatId);
  },

  saveMessage: async (
    chatId: string,
    message: { role: 'user' | 'assistant' | 'system'; content: string; metadata?: any }
  ) => {
    return getAPI().chat.saveMessage(chatId, message);
  },
};

/**
 * Settings API
 */
export const settingsApi = {
  get: async () => {
    return getAPI().settings.get();
  },

  set: async (key: string, value: string) => {
    return getAPI().settings.set(key, value);
  },

  setOllamaApiKey: async (key: string) => {
    return getAPI().settings.setOllamaApiKey(key);
  },
};

/**
 * Files API
 */
export const filesApi = {
  upload: async (chatId: string) => {
    return getAPI().files.upload(chatId);
  },

  list: async (chatId: string) => {
    return getAPI().files.list(chatId);
  },

  delete: async (fileId: string) => {
    return getAPI().files.delete(fileId);
  },
};

/**
 * Dialog API
 */
export const dialogApi = {
  openFile: async (options: {
    title?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
    properties?: Array<'openFile' | 'openDirectory' | 'multiSelections'>;
  }) => {
    return getAPI().dialog.openFile(options);
  },
};

/**
 * Event Subscriptions
 */
export const events = {
  /**
   * Subscribe to chat chunks (streaming responses)
   * Returns an unsubscribe function
   */
  onChatChunk: (callback: (chunk: any) => void): (() => void) => {
    return getAPI().on.chatChunk(callback);
  },

  /**
   * Subscribe to research updates
   * Returns an unsubscribe function
   */
  onResearchUpdate: (callback: (update: any) => void): (() => void) => {
    return getAPI().on.researchUpdate(callback);
  },
};

// Default export for backward compatibility
export default {
  ollama: ollamaApi,
  research: researchApi,
  chat: chatApi,
  settings: settingsApi,
  files: filesApi,
  dialog: dialogApi,
  events,
  isElectron,
};
