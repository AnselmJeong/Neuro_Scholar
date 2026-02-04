import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { initializeDb, closeDb } from './db';
import { ollamaService } from './ollama/service';
import { registerOllamaHandlers } from './ipc/ollama';
import { registerChatHandlers } from './ipc/chat';
import { registerSettingsHandlers } from './ipc/settings';
import { registerResearchHandlers } from './ipc/research';
import { registerFileHandlers } from './ipc/files';

// Load environment variables
dotenv.config();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for better-sqlite3
    },
  });

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built renderer
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Get the main window for sending IPC events
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// App lifecycle
app.whenReady().then(async () => {
  console.log('[Main] Neuro Scholar starting...');

  // Initialize database
  initializeDb();
  console.log('[Main] Database initialized');

  // Initialize Ollama service
  const ollamaReady = ollamaService.initialize();
  console.log('[Main] Ollama service initialized:', ollamaReady ? 'ready' : 'needs API key');

  // Register IPC handlers
  registerOllamaHandlers(ipcMain);
  registerChatHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  registerResearchHandlers(ipcMain);
  registerFileHandlers(ipcMain);
  console.log('[Main] IPC handlers registered');

  // Create the main window
  createWindow();

  // macOS: Re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Cleanup on app quit
app.on('will-quit', () => {
  closeDb();
  console.log('[Main] Cleanup complete');
});

// Handle certificate errors in development
if (process.env.NODE_ENV === 'development') {
  app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
    event.preventDefault();
    callback(true);
  });
}
