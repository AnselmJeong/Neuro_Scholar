import { IpcMain, IpcMainInvokeEvent } from 'electron';
import { ollamaService } from '../ollama/service';
import { getMainWindow } from '../main';
import { ChatPayload } from '../ollama/types';

export function registerOllamaHandlers(ipcMain: IpcMain): void {
  // Get available models
  ipcMain.handle('ollama:getModels', async () => {
    return await ollamaService.getModels();
  });

  // Check if Ollama is initialized
  ipcMain.handle('ollama:isInitialized', () => {
    return ollamaService.isInitialized();
  });

  // Chat with streaming (sends chunks via event)
  ipcMain.handle('ollama:chat', async (event: IpcMainInvokeEvent, payload: ChatPayload) => {
    const mainWindow = getMainWindow();
    let fullContent = '';
    let fullThinking = '';

    try {
      for await (const chunk of ollamaService.chatStream(payload)) {
        // Send chunk to renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ollama-chat-chunk', chunk);
        }

        if (chunk.content) fullContent += chunk.content;
        if (chunk.thinking) fullThinking += chunk.thinking;

        if (chunk.error) {
          throw new Error(chunk.error);
        }
      }

      return { content: fullContent, thinking: fullThinking };
    } catch (error: any) {
      console.error('[IPC:Ollama] Chat error:', error);
      throw error;
    }
  });

  // Direct chat without streaming (for internal use)
  ipcMain.handle('ollama:chatDirect', async (_event: IpcMainInvokeEvent, payload: ChatPayload) => {
    return await ollamaService.chat(payload);
  });

  // Web search
  ipcMain.handle('ollama:webSearch', async (_event: IpcMainInvokeEvent, query: string) => {
    return await ollamaService.webSearch(query);
  });

  // Web fetch
  ipcMain.handle('ollama:webFetch', async (_event: IpcMainInvokeEvent, url: string) => {
    return await ollamaService.webFetch(url);
  });

  console.log('[IPC] Ollama handlers registered');
}
