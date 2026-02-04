import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';

let db: Database.Database | null = null;

export function initializeDb(): Database.Database {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'neuro-scholar.db');

  db = new Database(dbPath);

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    -- Settings table for API keys and preferences
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- Chats table
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT,
      mode TEXT DEFAULT 'research' CHECK (mode IN ('research', 'chat')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      role TEXT CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Research sessions table
    CREATE TABLE IF NOT EXISTS research_sessions (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'cancelled', 'completed')),
      query TEXT,
      plan TEXT,
      current_step INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Uploaded files table
    CREATE TABLE IF NOT EXISTS uploaded_files (
      id TEXT PRIMARY KEY,
      chat_id TEXT REFERENCES chats(id) ON DELETE CASCADE,
      filename TEXT,
      file_type TEXT CHECK (file_type IN ('pdf', 'md', 'qmd')),
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id);
    CREATE INDEX IF NOT EXISTS idx_research_sessions_chat_id ON research_sessions(chat_id);
    CREATE INDEX IF NOT EXISTS idx_uploaded_files_chat_id ON uploaded_files(chat_id);
  `);

  console.log('[DB] Database initialized at:', dbPath);
  return db;
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDb() first.');
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database closed');
  }
}

// Settings helpers
export function getSetting(key: string): string | null {
  const db = getDb();
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setSetting(key: string, value: string): void {
  const db = getDb();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  return rows.reduce((acc, row) => {
    acc[row.key] = row.value;
    return acc;
  }, {} as Record<string, string>);
}
