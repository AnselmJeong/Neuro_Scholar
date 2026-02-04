import { IpcMain } from 'electron';
import { getAllSettings, setSetting, getSetting } from '../db';
import { ollamaService } from '../ollama/service';

export function registerSettingsHandlers(ipcMain: IpcMain): void {
  // Get all settings
  ipcMain.handle('settings:get', () => {
    return getAllSettings();
  });

  // Set a single setting
  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    setSetting(key, value);
  });

  // Get a single setting
  ipcMain.handle('settings:getSingle', (_event, key: string) => {
    return getSetting(key);
  });

  // Special handler for Ollama API key (reinitializes service)
  ipcMain.handle('settings:setOllamaApiKey', (_event, key: string) => {
    ollamaService.updateApiKey(key);
    console.log('[Settings] Ollama API key updated');
  });

  // Get selected model
  ipcMain.handle('settings:getSelectedModel', () => {
    return getSetting('selectedOllamaModel') || 'llama3.2';
  });

  // Set selected model
  ipcMain.handle('settings:setSelectedModel', (_event, model: string) => {
    setSetting('selectedOllamaModel', model);
  });

  console.log('[IPC] Settings handlers registered');
}
