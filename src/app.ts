import fs from 'node:fs';

import { loadConfig, type BridgeConfig } from './config.js';
import { runCodex } from './codex/runner.js';
import { createFeishuSendAdapter } from './feishu/adapter.js';
import { parseInboundMessage } from './feishu/parse.js';
import { startFeishuWsWithRetry } from './feishu/ws.js';
import type { FeishuMessageEvent } from './feishu/types.js';
import { InboundDispatcher } from './handler/dispatcher.js';
import type { RunCodexAdapter, SendAdapter } from './handler/handle.js';
import { openStore, type Store } from './store/db.js';

export type AppCommonOpts = {
  configPath?: string;
  codexPath?: string; // default "codex"
  botOpenId?: string; // optional: improves mention detection
  dryRun?: boolean;
};

function createRunCodexAdapter(opts: { cfg: BridgeConfig } & AppCommonOpts): RunCodexAdapter {
  const codexPath = opts.codexPath ?? process.env.CODEX_PATH ?? 'codex';
  const dryRun = Boolean(opts.dryRun);

  return async ({ threadId, workspace, sandbox, prompt }) => {
    if (dryRun) {
      const shown = `DRY-RUN (no codex executed)\n\n\`\`\`\n${prompt}\n\`\`\``;
      return { threadId: threadId ?? 'dry_run_thread', finalText: shown };
    }

    const r = await runCodex({
      codexPath,
      threadId,
      workspace,
      sandbox,
      prompt,
      timeoutMs: 10 * 60 * 1_000,
    });
    return { threadId: r.threadId, finalText: r.finalText };
  };
}

function createReplaySendAdapter(): { send: SendAdapter; sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    send: {
      sendReply: async ({ chunks }) => {
        sent.push(...chunks);
      },
    },
  };
}

export async function runReplay(opts: AppCommonOpts & { fixturePath: string }): Promise<{ sent: string[] }> {
  const cfg = loadConfig({ configPath: opts.configPath });
  const store = openStore(':memory:');
  const { sent, send } = createReplaySendAdapter();

  const dispatcher = new InboundDispatcher({
    cfg,
    store,
    runCodex: createRunCodexAdapter({ cfg, ...opts }),
    send,
  });

  const raw = fs.readFileSync(opts.fixturePath, 'utf-8');
  const event = JSON.parse(raw) as FeishuMessageEvent;
  const inbound = parseInboundMessage(event, { botOpenId: opts.botOpenId });

  await dispatcher.dispatch(inbound);
  return { sent };
}

export async function runService(opts: AppCommonOpts): Promise<void> {
  const cfg = loadConfig({ configPath: opts.configPath });
  const store = openStore(cfg.storage.db_path);
  const send = createFeishuSendAdapter(cfg);
  const runCodexAdapter = createRunCodexAdapter({ cfg, ...opts });

  const dispatcher = new InboundDispatcher({
    cfg,
    store,
    runCodex: runCodexAdapter,
    send,
  });

  const { wsClient } = await startFeishuWsWithRetry({
    cfg,
    dispatcher,
    botOpenId: opts.botOpenId,
    maxAttempts: Number.POSITIVE_INFINITY,
  });

  const info = wsClient.getReconnectInfo?.();
  console.log('[ws] started', info ?? '');

  // Keep process alive.
  await new Promise<void>(() => {});
}

export function openStoreForDoctor(dbPath: string): Store {
  return openStore(dbPath);
}
