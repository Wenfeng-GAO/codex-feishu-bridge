import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema } from '../../src/config.js';
import { InboundDispatcher } from '../../src/handler/dispatcher.js';
import { createInboundMessageHandler } from '../../src/feishu/ws.js';
import { openStore } from '../../src/store/db.js';

describe('integration: ws handler dedupe via processed_messages', () => {
  it('does not re-run the same message_id', async () => {
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

    let runs = 0;
    let sends = 0;
    const dispatcher = new InboundDispatcher({
      cfg,
      store,
      runCodex: async ({ threadId }) => {
        runs += 1;
        return { threadId: threadId ?? 't', finalText: 'OK' };
      },
      send: {
        sendReply: async () => {
          sends += 1;
        },
      },
    });

    const handler = createInboundMessageHandler({ dispatcher, botOpenId: 'ou_bot' });
    const event = {
      sender: { sender_id: { open_id: 'ou_sender' } },
      message: {
        message_id: 'm_same',
        chat_id: 'oc_fixture_chat',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@Bot hi' }),
        mentions: [{ key: '<at user_id="ou_bot">Bot</at>', id: { open_id: 'ou_bot' }, name: 'Bot' }],
      },
    };

    await handler(event as any);
    await handler(event as any);

    expect(runs).toBe(1);
    expect(sends).toBe(1);
  });
});

