import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { openStore } from '../../src/store/db.js';

describe('integration: store', () => {
  it('persists chat session + processed message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfb-store-it-'));
    const dbPath = path.join(dir, 'state.sqlite3');

    {
      const store = openStore(dbPath);
      store.migrate();
      store.upsertChatSession({
        chatId: 'chat1',
        workspace: '/tmp',
        threadId: 'thread1',
        sandbox: 'read-only',
        updatedAt: Date.now(),
      });
      store.markMessageProcessed({ messageId: 'msg1', chatId: 'chat1', createdAt: Date.now() });
      store.close();
    }

    {
      const store = openStore(dbPath);
      store.migrate();
      expect(store.getChatSession('chat1')?.thread_id).toBe('thread1');
      expect(store.isMessageProcessed('msg1')).toBe(true);
      store.close();
    }
  });
});

