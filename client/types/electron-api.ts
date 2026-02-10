export interface ElectronAPI {
  ollama: {
    getModels: () => Promise<any[]>;
    chat: (payload: any) => Promise<{ content: string; thinking: string }>;
    isInitialized: () => Promise<boolean>;
  };
  research: {
    start: (payload: { chatId: string; query: string; model: string; language?: 'en' | 'ko' }) => Promise<string>;
    pause: (sessionId: string) => Promise<void>;
    resume: (sessionId: string) => Promise<void>;
    cancel: (sessionId: string) => Promise<void>;
    updateQuery: (sessionId: string, newQuery: string) => Promise<void>;
  };
  chat: {
    list: () => Promise<any[]>;
    create: (mode: 'research' | 'chat') => Promise<any>;
    get: (chatId: string) => Promise<any>;
    update: (chatId: string, updates: any) => Promise<void>;
    delete: (chatId: string) => Promise<void>;
    getMessages: (chatId: string) => Promise<any[]>;
    saveMessage: (chatId: string, message: any) => Promise<any>;
  };
  settings: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<void>;
    setOllamaApiKey: (key: string) => Promise<void>;
  };
  files: {
    upload: (chatId: string) => Promise<any>;
    list: (chatId: string) => Promise<any[]>;
    delete: (fileId: string) => Promise<void>;
  };
  dialog: {
    openFile: (options: any) => Promise<{ filePaths: string[]; canceled: boolean }>;
  };
  on: {
    chatChunk: (callback: (chunk: any) => void) => () => void;
    researchUpdate: (callback: (update: any) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

