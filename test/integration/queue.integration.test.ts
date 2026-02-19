import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema } from '../../src/config.js';
import type { Inbound } from '../../src/feishu/types.js';
import { openStore } from '../../src/store/db.js';
import { InboundDispatcher } from '../../src/handler/dispatcher.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('integration: queue', () => {
  it('serializes dispatch per chat_id', async () => {
    const cfg = BridgeConfigSchema.parse({
      feishu: { domain: 'feishu', connection_mode: 'websocket' },
      policy: {
        dm_policy: 'open',
        group_policy: 'open',
        require_mention: false,
        allow_from_user_open_ids: [],
        allow_from_group_chat_ids: [],
      },
      routing: { default_workspace: '/tmp', chat_to_workspace: {}, workspace_allowlist: ['/tmp'] },
      storage: { db_path: ':memory:' },
      codex: { sandbox_default: 'read-only', model: '', max_concurrency: 4 },
    });
    const store = openStore(cfg.storage.db_path);

    const trace: string[] = [];
    const runCodex = async ({ prompt }: { prompt: string }) => {
      trace.push(`run:${prompt}`);
      await sleep(30);
      return { threadId: 't', finalText: 'ok' };
    };
    const send = { ackReceived: async () => {}, sendReply: async () => {} };

    const d = new InboundDispatcher({
      cfg,
      store,
      runCodex: runCodex as any,
      send: send as any,
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    const inbound1: Inbound = {
      chat_id: 'c1',
      chat_type: 'p2p',
      message_id: 'm1',
      sender_open_id: 'ou',
      message_type: 'text',
      raw_content: '',
      text: 'A',
      mentioned_bot: false,
    };
    const inbound2: Inbound = { ...inbound1, message_id: 'm2', text: 'B' };

    await Promise.all([d.dispatch(inbound1), d.dispatch(inbound2)]);
    expect(trace).toEqual(['run:[Feishu DM] ou: A', 'run:[Feishu DM] ou: B']);
  });
});
