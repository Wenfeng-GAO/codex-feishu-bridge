import fs from 'node:fs';

import { BridgeConfigSchema } from '../src/config.js';
import { parseInboundMessage } from '../src/feishu/parse.js';
import type { FeishuMessageEvent } from '../src/feishu/types.js';
import { openStore } from '../src/store/db.js';
import { handleInbound } from '../src/handler/handle.js';

async function main(): Promise<void> {
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
    runCodex: async ({ threadId }) => ({
      threadId: threadId ?? 'thread_fixture',
      finalText: 'OK (stubbed codex)',
    }),
    send: {
      sendReply: async ({ chunks }) => {
        sent.push(...chunks);
      },
    },
  });

  if (sent.length !== 1 || sent[0] !== 'OK (stubbed codex)') {
    throw new Error(`smoke: unexpected send output: ${JSON.stringify(sent)}`);
  }

  console.log('smoke:replay OK');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
