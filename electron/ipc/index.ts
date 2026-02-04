import { IpcMain } from 'electron';
import { registerOllamaHandlers } from './ollama';
import { registerChatHandlers } from './chat';
import { registerSettingsHandlers } from './settings';
import { registerResearchHandlers } from './research';
import { registerFileHandlers } from './files';

/**
 * Register all IPC handlers
 */
export function registerAllHandlers(ipcMain: IpcMain): void {
  registerOllamaHandlers(ipcMain);
  registerChatHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  registerResearchHandlers(ipcMain);
  registerFileHandlers(ipcMain);

  console.log('[IPC] All handlers registered');
}

export {
  registerOllamaHandlers,
  registerChatHandlers,
  registerSettingsHandlers,
  registerResearchHandlers,
  registerFileHandlers,
};
