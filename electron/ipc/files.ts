import { IpcMain, dialog, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { getDb } from '../db';
import { FileParser } from '../tools/file_parser';

interface UploadedFile {
  id: string;
  chat_id: string;
  filename: string;
  file_type: 'pdf' | 'md' | 'qmd';
  content: string;
  created_at: string;
}

const fileParser = new FileParser();

export function registerFileHandlers(ipcMain: IpcMain): void {
  const db = getDb();

  // Open file dialog and upload
  ipcMain.handle('files:upload', async (_event, chatId: string) => {
    const result = await dialog.showOpenDialog({
      title: 'Select Reference Document',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'md', 'qmd'] },
        { name: 'PDF Files', extensions: ['pdf'] },
        { name: 'Markdown Files', extensions: ['md', 'qmd'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase().slice(1) as 'pdf' | 'md' | 'qmd';

    try {
      // Parse file content
      const { content, metadata } = await fileParser.parse(filePath);

      // Save to database
      const id = uuidv4();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO uploaded_files (id, chat_id, filename, file_type, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, chatId, filename, ext, content, now);

      console.log(`[Files] Uploaded: ${filename} (${content.length} chars)`);

      return {
        id,
        chat_id: chatId,
        filename,
        file_type: ext,
        content_preview: content.slice(0, 500) + (content.length > 500 ? '...' : ''),
        metadata,
        created_at: now,
      };
    } catch (error: any) {
      console.error(`[Files] Upload error:`, error);
      throw new Error(`Failed to parse file: ${error.message}`);
    }
  });

  // List files for a chat
  ipcMain.handle('files:list', (_event, chatId: string) => {
    const files = db
      .prepare(
        `SELECT id, chat_id, filename, file_type, LENGTH(content) as content_length, created_at
         FROM uploaded_files
         WHERE chat_id = ?
         ORDER BY created_at DESC`
      )
      .all(chatId) as (Omit<UploadedFile, 'content'> & { content_length: number })[];

    return files;
  });

  // Get file content
  ipcMain.handle('files:getContent', (_event, fileId: string) => {
    const file = db
      .prepare('SELECT content FROM uploaded_files WHERE id = ?')
      .get(fileId) as { content: string } | undefined;

    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }

    return file.content;
  });

  // Get all file contents for a chat (for research context)
  ipcMain.handle('files:getAllContent', (_event, chatId: string) => {
    const files = db
      .prepare(
        `SELECT filename, content FROM uploaded_files WHERE chat_id = ?`
      )
      .all(chatId) as { filename: string; content: string }[];

    return files.map((f) => ({
      filename: f.filename,
      content: f.content,
    }));
  });

  // Delete a file
  ipcMain.handle('files:delete', (_event, fileId: string) => {
    db.prepare('DELETE FROM uploaded_files WHERE id = ?').run(fileId);
    console.log(`[Files] Deleted: ${fileId}`);
  });

  // Generic file open dialog
  ipcMain.handle('dialog:openFile', async (_event, options: Electron.OpenDialogOptions) => {
    return await dialog.showOpenDialog(options);
  });

  console.log('[IPC] File handlers registered');
}
