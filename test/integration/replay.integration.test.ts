import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema } from '../../src/config.js';
import { parseInboundMessage } from '../../src/feishu/parse.js';
import type { FeishuMessageEvent } from '../../src/feishu/types.js';
import { openStore } from '../../src/store/db.js';
import { handleInbound } from '../../src/handler/handle.js';

describe('integration: replay', () => {
  it('runs parse -> policy -> codex stub -> render -> send', async () => {
    const raw = fs.readFileSync('fixtures/feishu/im.message.receive_v1.text.json', 'utf-8');
    const event = JSON.parse(raw) as FeishuMessageEvent;
    const inbound = parseInboundMessage(event, { botOpenId: 'ou_bot' });

    const cfg = BridgeConfigSchema.parse({
      feishu: { domain: 'feishu', connection_mode: 'websocket' },
      policy: {
        dm_policy: 'pairing',
        group_policy: 'allowlist',
        require_mention: true,
        allow_from_user_open_ids: [],
        allow_from_group_chat_ids: ['oc_fixture_chat'],
      },
      routing: {
        default_workspace: '/tmp',
        chat_to_workspace: { oc_fixture_chat: '/tmp' },
        workspace_allowlist: ['/tmp'],
      },
      storage: { db_path: ':memory:' },
      codex: { sandbox_default: 'read-only', model: '', max_concurrency: 4 },
    });

    const store = openStore(cfg.storage.db_path);
    const sent: string[] = [];

    await handleInbound({
      cfg,
      store,
      inbound,
      runCodex: async () => ({ threadId: 't1', finalText: 'hello' }),
      send: {
        ackReceived: async () => {},
        sendReply: async ({ chunks }) => {
          sent.push(...chunks);
        },
      },
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    expect(sent).toEqual(['hello']);
    expect(store.getChatSession('oc_fixture_chat')?.thread_id).toBe('t1');
    expect(store.isMessageProcessed('m_fixture_1')).toBe(true);
  });
});
