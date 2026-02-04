import { IpcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db';

interface Chat {
  id: string;
  title: string;
  mode: 'research' | 'chat';
  created_at: string;
  updated_at: string;
}

interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata: string | null;
  created_at: string;
}

export function registerChatHandlers(ipcMain: IpcMain): void {
  const db = getDb();

  // List all chats
  ipcMain.handle('chat:list', () => {
    const chats = db
      .prepare(
        `SELECT id, title, mode, created_at, updated_at
         FROM chats
         ORDER BY updated_at DESC`
      )
      .all() as Chat[];

    return chats;
  });

  // Create a new chat
  ipcMain.handle('chat:create', (_event, mode: 'research' | 'chat' = 'research') => {
    const id = uuidv4();
    const title = mode === 'research' ? 'New Research' : 'New Chat';
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO chats (id, title, mode, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).run(id, title, mode, now, now);

    return {
      id,
      title,
      mode,
      created_at: now,
      updated_at: now,
    };
  });

  // Get a specific chat
  ipcMain.handle('chat:get', (_event, chatId: string) => {
    const chat = db.prepare('SELECT * FROM chats WHERE id = ?').get(chatId) as Chat | undefined;

    if (!chat) {
      throw new Error(`Chat not found: ${chatId}`);
    }

    return chat;
  });

  // Update a chat
  ipcMain.handle('chat:update', (_event, chatId: string, updates: Partial<Chat>) => {
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.title !== undefined) {
      fields.push('title = ?');
      values.push(updates.title);
    }
    if (updates.mode !== undefined) {
      fields.push('mode = ?');
      values.push(updates.mode);
    }

    fields.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(chatId);

    db.prepare(`UPDATE chats SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  });

  // Delete a chat
  ipcMain.handle('chat:delete', (_event, chatId: string) => {
    db.prepare('DELETE FROM chats WHERE id = ?').run(chatId);
  });

  // Get messages for a chat
  ipcMain.handle('chat:getMessages', (_event, chatId: string) => {
    const messages = db
      .prepare(
        `SELECT id, chat_id, role, content, metadata, created_at
         FROM messages
         WHERE chat_id = ?
         ORDER BY created_at ASC`
      )
      .all(chatId) as Message[];

    // Parse metadata JSON
    return messages.map((msg) => ({
      ...msg,
      metadata: msg.metadata ? JSON.parse(msg.metadata) : null,
    }));
  });

  // Save a message
  ipcMain.handle(
    'chat:saveMessage',
    (
      _event,
      chatId: string,
      message: {
        role: 'user' | 'assistant' | 'system';
        content: string;
        metadata?: any;
      }
    ) => {
      const id = uuidv4();
      const now = new Date().toISOString();
      const metadataStr = message.metadata ? JSON.stringify(message.metadata) : null;

      db.prepare(
        `INSERT INTO messages (id, chat_id, role, content, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, chatId, message.role, message.content, metadataStr, now);

      // Update chat's updated_at
      db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);

      return {
        id,
        chat_id: chatId,
        role: message.role,
        content: message.content,
        metadata: message.metadata || null,
        created_at: now,
      };
    }
  );

  // Delete a message
  ipcMain.handle('chat:deleteMessage', (_event, messageId: string) => {
    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  });

  console.log('[IPC] Chat handlers registered');
}
