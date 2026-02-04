import { IpcMain } from 'electron';
import { researchOrchestrator } from '../research/orchestrator';
import { getDb } from '../db';

export function registerResearchHandlers(ipcMain: IpcMain): void {
  const db = getDb();

  // Start a new research session
  ipcMain.handle(
    'research:start',
    async (_event, payload: { chatId: string; query: string; model: string; language?: 'en' | 'ko' }) => {
      const { chatId, query, model, language = 'en' } = payload;

      // Save user message
      const messageId = require('uuid').v4();
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO messages (id, chat_id, role, content, created_at)
         VALUES (?, ?, 'user', ?, ?)`
      ).run(messageId, chatId, query, now);

      // Start research
      const sessionId = await researchOrchestrator.startResearch(chatId, query, model, language);

      return sessionId;
    }
  );

  // Pause research
  ipcMain.handle('research:pause', (_event, sessionId: string) => {
    researchOrchestrator.pause(sessionId);
  });

  // Resume research
  ipcMain.handle('research:resume', (_event, sessionId: string) => {
    researchOrchestrator.resume(sessionId);
  });

  // Cancel research
  ipcMain.handle('research:cancel', (_event, sessionId: string) => {
    researchOrchestrator.cancel(sessionId);
  });

  // Update query
  ipcMain.handle('research:updateQuery', async (_event, sessionId: string, newQuery: string) => {
    await researchOrchestrator.updateQuery(sessionId, newQuery);
  });

  // Get research session status
  ipcMain.handle('research:getSession', (_event, sessionId: string) => {
    const session = db
      .prepare(
        `SELECT id, chat_id, status, query, plan, current_step, created_at, updated_at
         FROM research_sessions WHERE id = ?`
      )
      .get(sessionId) as any;

    if (!session) {
      return null;
    }

    return {
      ...session,
      plan: session.plan ? JSON.parse(session.plan) : null,
    };
  });

  // Get active session
  ipcMain.handle('research:getActive', () => {
    return researchOrchestrator.getActiveSession();
  });

  // Get research sessions for a chat
  ipcMain.handle('research:listForChat', (_event, chatId: string) => {
    const sessions = db
      .prepare(
        `SELECT id, status, query, current_step, created_at, updated_at
         FROM research_sessions
         WHERE chat_id = ?
         ORDER BY created_at DESC`
      )
      .all(chatId);

    return sessions;
  });

  console.log('[IPC] Research handlers registered');
}
