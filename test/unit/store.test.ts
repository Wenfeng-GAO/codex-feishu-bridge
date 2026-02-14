import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { openStore } from '../../src/store/db.js';

describe('store/db', () => {
  it('dedupes processed_messages by message_id', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfb-store-'));
    const dbPath = path.join(dir, 'state.sqlite3');
    const store = openStore(dbPath);
    store.migrate();

    expect(store.isMessageProcessed('m1')).toBe(false);
    store.markMessageProcessed({ messageId: 'm1', chatId: 'c1', createdAt: 1 });
    expect(store.isMessageProcessed('m1')).toBe(true);

    // Insert duplicate should not throw and should still be processed.
    store.markMessageProcessed({ messageId: 'm1', chatId: 'c1', createdAt: 2 });
    expect(store.isMessageProcessed('m1')).toBe(true);

    store.close();
  });

  it('upserts chat_sessions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfb-store-'));
    const dbPath = path.join(dir, 'state.sqlite3');
    const store = openStore(dbPath);
    store.migrate();

    expect(store.getChatSession('c1')).toBeNull();
    store.upsertChatSession({
      chatId: 'c1',
      workspace: '/tmp/a',
      threadId: null,
      sandbox: 'read-only',
      updatedAt: 10,
    });
    const s1 = store.getChatSession('c1');
    expect(s1?.workspace).toBe('/tmp/a');
    expect(s1?.thread_id).toBeNull();
    expect(s1?.sandbox).toBe('read-only');

    store.upsertChatSession({
      chatId: 'c1',
      workspace: '/tmp/b',
      threadId: 't1',
      sandbox: 'workspace-write',
      updatedAt: 11,
    });
    const s2 = store.getChatSession('c1');
    expect(s2?.workspace).toBe('/tmp/b');
    expect(s2?.thread_id).toBe('t1');
    expect(s2?.sandbox).toBe('workspace-write');
    expect(s2?.updated_at).toBe(11);

    store.close();
  });
});

