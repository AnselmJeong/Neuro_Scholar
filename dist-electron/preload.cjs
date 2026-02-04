"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electronAPI", {
  // Ollama
  ollama: {
    getModels: () => electron.ipcRenderer.invoke("ollama:getModels"),
    chat: (payload) => electron.ipcRenderer.invoke("ollama:chat", payload),
    isInitialized: () => electron.ipcRenderer.invoke("ollama:isInitialized")
  },
  // Research
  research: {
    start: (payload) => electron.ipcRenderer.invoke("research:start", payload),
    pause: (sessionId) => electron.ipcRenderer.invoke("research:pause", sessionId),
    resume: (sessionId) => electron.ipcRenderer.invoke("research:resume", sessionId),
    cancel: (sessionId) => electron.ipcRenderer.invoke("research:cancel", sessionId),
    updateQuery: (sessionId, newQuery) => electron.ipcRenderer.invoke("research:updateQuery", sessionId, newQuery)
  },
  // Chat
  chat: {
    list: () => electron.ipcRenderer.invoke("chat:list"),
    create: (mode) => electron.ipcRenderer.invoke("chat:create", mode),
    get: (chatId) => electron.ipcRenderer.invoke("chat:get", chatId),
    update: (chatId, updates) => electron.ipcRenderer.invoke("chat:update", chatId, updates),
    delete: (chatId) => electron.ipcRenderer.invoke("chat:delete", chatId),
    getMessages: (chatId) => electron.ipcRenderer.invoke("chat:getMessages", chatId),
    saveMessage: (chatId, message) => electron.ipcRenderer.invoke("chat:saveMessage", chatId, message)
  },
  // Settings
  settings: {
    get: () => electron.ipcRenderer.invoke("settings:get"),
    set: (key, value) => electron.ipcRenderer.invoke("settings:set", key, value),
    setOllamaApiKey: (key) => electron.ipcRenderer.invoke("settings:setOllamaApiKey", key)
  },
  // Files
  files: {
    upload: (chatId) => electron.ipcRenderer.invoke("files:upload", chatId),
    list: (chatId) => electron.ipcRenderer.invoke("files:list", chatId),
    delete: (fileId) => electron.ipcRenderer.invoke("files:delete", fileId)
  },
  // Dialog
  dialog: {
    openFile: (options) => electron.ipcRenderer.invoke("dialog:openFile", options)
  },
  // Event listeners with cleanup
  on: {
    chatChunk: (callback) => {
      const handler = (_event, chunk) => callback(chunk);
      electron.ipcRenderer.on("ollama-chat-chunk", handler);
      return () => electron.ipcRenderer.removeListener("ollama-chat-chunk", handler);
    },
    researchUpdate: (callback) => {
      const handler = (_event, update) => callback(update);
      electron.ipcRenderer.on("research-update", handler);
      return () => electron.ipcRenderer.removeListener("research-update", handler);
    }
  }
});
