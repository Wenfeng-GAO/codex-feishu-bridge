import fs from 'node:fs';
import path from 'node:path';

import { DatabaseSync } from 'node:sqlite';

export type ChatSessionRow = {
  chat_id: string;
  workspace: string;
  thread_id: string | null;
  sandbox: 'read-only' | 'workspace-write';
  updated_at: number;
};

export type Store = {
  close(): void;
  migrate(): void;

  isMessageProcessed(messageId: string): boolean;
  markMessageProcessed(params: { messageId: string; chatId: string; createdAt: number }): void;

  getChatSession(chatId: string): ChatSessionRow | null;
  upsertChatSession(params: {
    chatId: string;
    workspace: string;
    threadId: string | null;
    sandbox: 'read-only' | 'workspace-write';
    updatedAt: number;
  }): void;
};

export function openStore(dbPath: string): Store {
  // Ensure parent dir exists (unless in-memory).
  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  function migrate(): void {
    db.exec(
      [
        'CREATE TABLE IF NOT EXISTS processed_messages (',
        '  message_id TEXT PRIMARY KEY,',
        '  chat_id TEXT NOT NULL,',
        '  created_at INTEGER NOT NULL',
        ');',
        'CREATE INDEX IF NOT EXISTS idx_processed_messages_chat_id ON processed_messages(chat_id);',
        '',
        'CREATE TABLE IF NOT EXISTS chat_sessions (',
        '  chat_id TEXT PRIMARY KEY,',
        '  workspace TEXT NOT NULL,',
        '  thread_id TEXT,',
        '  sandbox TEXT NOT NULL,',
        '  updated_at INTEGER NOT NULL',
        ');',
      ].join('\n'),
    );
  }

  // Ensure schema exists before preparing statements.
  migrate();

  const stmtIsProcessed = db.prepare(
    'SELECT 1 FROM processed_messages WHERE message_id = ? LIMIT 1;',
  );
  const stmtMarkProcessed = db.prepare(
    'INSERT OR IGNORE INTO processed_messages(message_id, chat_id, created_at) VALUES(?, ?, ?);',
  );
  const stmtGetChat = db.prepare(
    'SELECT chat_id, workspace, thread_id, sandbox, updated_at FROM chat_sessions WHERE chat_id = ? LIMIT 1;',
  );
  const stmtUpsertChat = db.prepare(
    [
      'INSERT INTO chat_sessions(chat_id, workspace, thread_id, sandbox, updated_at)',
      'VALUES(?, ?, ?, ?, ?)',
      'ON CONFLICT(chat_id) DO UPDATE SET',
      '  workspace=excluded.workspace,',
      '  thread_id=excluded.thread_id,',
      '  sandbox=excluded.sandbox,',
      '  updated_at=excluded.updated_at;',
    ].join('\n'),
  );

  return {
    close: () => db.close(),
    migrate,
    isMessageProcessed: (messageId) => Boolean(stmtIsProcessed.get(messageId)),
    markMessageProcessed: ({ messageId, chatId, createdAt }) => {
      stmtMarkProcessed.run(messageId, chatId, createdAt);
    },
    getChatSession: (chatId) => {
      const row = stmtGetChat.get(chatId) as ChatSessionRow | undefined;
      return row ?? null;
    },
    upsertChatSession: ({ chatId, workspace, threadId, sandbox, updatedAt }) => {
      stmtUpsertChat.run(chatId, workspace, threadId, sandbox, updatedAt);
    },
  };
}
