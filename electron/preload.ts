import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Type definitions for the exposed API
export interface ElectronAPI {
  // Ollama
  ollama: {
    getModels: () => Promise<any[]>;
    chat: (payload: any) => Promise<{ content: string; thinking: string }>;
    isInitialized: () => Promise<boolean>;
  };

  // Research
  research: {
    start: (payload: { chatId: string; query: string; model: string }) => Promise<string>;
    pause: (sessionId: string) => Promise<void>;
    resume: (sessionId: string) => Promise<void>;
    cancel: (sessionId: string) => Promise<void>;
    updateQuery: (sessionId: string, newQuery: string) => Promise<void>;
  };

  // Chat
  chat: {
    list: () => Promise<any[]>;
    create: (mode: 'research' | 'chat') => Promise<any>;
    get: (chatId: string) => Promise<any>;
    update: (chatId: string, updates: any) => Promise<void>;
    delete: (chatId: string) => Promise<void>;
    getMessages: (chatId: string) => Promise<any[]>;
    saveMessage: (chatId: string, message: any) => Promise<any>;
  };

  // Settings
  settings: {
    get: () => Promise<Record<string, string>>;
    set: (key: string, value: string) => Promise<void>;
    setOllamaApiKey: (key: string) => Promise<void>;
  };

  // Files
  files: {
    upload: (chatId: string) => Promise<any>;
    list: (chatId: string) => Promise<any[]>;
    delete: (fileId: string) => Promise<void>;
  };

  // Dialog
  dialog: {
    openFile: (options: any) => Promise<{ filePaths: string[]; canceled: boolean }>;
  };

  // Event listeners
  on: {
    chatChunk: (callback: (chunk: any) => void) => () => void;
    researchUpdate: (callback: (update: any) => void) => () => void;
  };
}

// Expose APIs to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Ollama
  ollama: {
    getModels: () => ipcRenderer.invoke('ollama:getModels'),
    chat: (payload: any) => ipcRenderer.invoke('ollama:chat', payload),
    isInitialized: () => ipcRenderer.invoke('ollama:isInitialized'),
  },

  // Research
  research: {
    start: (payload: { chatId: string; query: string; model: string }) =>
      ipcRenderer.invoke('research:start', payload),
    pause: (sessionId: string) => ipcRenderer.invoke('research:pause', sessionId),
    resume: (sessionId: string) => ipcRenderer.invoke('research:resume', sessionId),
    cancel: (sessionId: string) => ipcRenderer.invoke('research:cancel', sessionId),
    updateQuery: (sessionId: string, newQuery: string) =>
      ipcRenderer.invoke('research:updateQuery', sessionId, newQuery),
  },

  // Chat
  chat: {
    list: () => ipcRenderer.invoke('chat:list'),
    create: (mode: 'research' | 'chat') => ipcRenderer.invoke('chat:create', mode),
    get: (chatId: string) => ipcRenderer.invoke('chat:get', chatId),
    update: (chatId: string, updates: any) => ipcRenderer.invoke('chat:update', chatId, updates),
    delete: (chatId: string) => ipcRenderer.invoke('chat:delete', chatId),
    getMessages: (chatId: string) => ipcRenderer.invoke('chat:getMessages', chatId),
    saveMessage: (chatId: string, message: any) =>
      ipcRenderer.invoke('chat:saveMessage', chatId, message),
  },

  // Settings
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    setOllamaApiKey: (key: string) => ipcRenderer.invoke('settings:setOllamaApiKey', key),
  },

  // Files
  files: {
    upload: (chatId: string) => ipcRenderer.invoke('files:upload', chatId),
    list: (chatId: string) => ipcRenderer.invoke('files:list', chatId),
    delete: (fileId: string) => ipcRenderer.invoke('files:delete', fileId),
  },

  // Dialog
  dialog: {
    openFile: (options: any) => ipcRenderer.invoke('dialog:openFile', options),
  },

  // Event listeners with cleanup
  on: {
    chatChunk: (callback: (chunk: any) => void) => {
      const handler = (_event: IpcRendererEvent, chunk: any) => callback(chunk);
      ipcRenderer.on('ollama-chat-chunk', handler);
      return () => ipcRenderer.removeListener('ollama-chat-chunk', handler);
    },
    researchUpdate: (callback: (update: any) => void) => {
      const handler = (_event: IpcRendererEvent, update: any) => callback(update);
      ipcRenderer.on('research-update', handler);
      return () => ipcRenderer.removeListener('research-update', handler);
    },
  },
} as ElectronAPI);

// Type declaration for window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
