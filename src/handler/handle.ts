import path from 'node:path';

import type { BridgeConfig } from '../config.js';
import { buildCodexPrompt } from '../codex/prompt.js';
import type { CodexSandbox, RunCodexResult } from '../codex/runner.js';
import { evaluateInboundPolicy } from '../feishu/policy.js';
import { renderReply } from '../feishu/render.js';
import type { Inbound } from '../feishu/types.js';
import type { Store } from '../store/db.js';

export type SendAdapter = {
  ackReceived(params: { messageId: string; emojiType?: string }): Promise<{ messageId: string; reactionId?: string } | undefined>;
  clearAck(params: { messageId: string; reactionId?: string }): Promise<void>;
  sendReply(params: {
    chatId: string;
    replyToMessageId?: string;
    modeUsed: 'raw' | 'card';
    chunks: string[];
  }): Promise<void>;
};

export type RunCodexAdapter = (params: {
  threadId?: string;
  workspace: string;
  sandbox: CodexSandbox;
  prompt: string;
}) => Promise<Pick<RunCodexResult, 'threadId' | 'finalText'>>;

function resolveWorkspace(cfg: BridgeConfig, inbound: Inbound): string {
  return cfg.routing.chat_to_workspace[inbound.chat_id] ?? cfg.routing.default_workspace;
}

function isWorkspaceAllowed(cfg: BridgeConfig, workspace: string): boolean {
  const ws = path.resolve(workspace);
  const mapped = Object.values(cfg.routing.chat_to_workspace).map((p) => path.resolve(p));
  const defaults = [path.resolve(cfg.routing.default_workspace), ...mapped];
  if (!cfg.routing.workspace_allowlist || cfg.routing.workspace_allowlist.length === 0) {
    return defaults.includes(ws);
  }
  const allow = cfg.routing.workspace_allowlist.map((p) => path.resolve(p));
  return allow.includes(ws);
}

export async function handleInbound(params: {
  cfg: BridgeConfig;
  store: Store;
  inbound: Inbound;
  runCodex: RunCodexAdapter;
  send: SendAdapter;
  renderMode?: 'raw' | 'card' | 'auto';
  textChunkLimit?: number;
}): Promise<void> {
  const { cfg, store, inbound } = params;

  if (store.isMessageProcessed(inbound.message_id)) return;

  const decision = evaluateInboundPolicy(cfg, inbound);
  if (!decision.allowed) {
    store.markMessageProcessed({
      messageId: inbound.message_id,
      chatId: inbound.chat_id,
      createdAt: Date.now(),
    });
    return;
  }

  const workspace = resolveWorkspace(cfg, inbound);
  if (!isWorkspaceAllowed(cfg, workspace)) {
    store.markMessageProcessed({
      messageId: inbound.message_id,
      chatId: inbound.chat_id,
      createdAt: Date.now(),
    });
    return;
  }

  // Non-blocking UX signal: react as soon as the task is accepted for execution.
  // Keep promise for later cleanup, but never await here.
  const ackPromise = params.send.ackReceived({ messageId: inbound.message_id, emojiType: 'Typing' }).catch(() => undefined);

  let replySent = false;
  try {
    const existing = store.getChatSession(inbound.chat_id);
    const sandbox: CodexSandbox = existing?.sandbox ?? cfg.codex.sandbox_default;
    const threadId = existing?.thread_id ?? undefined;

    const prompt = buildCodexPrompt(inbound);
    const result = await params.runCodex({ threadId, workspace, sandbox, prompt });

    store.upsertChatSession({
      chatId: inbound.chat_id,
      workspace,
      threadId: result.threadId,
      sandbox,
      updatedAt: Date.now(),
    });

    const renderMode = params.renderMode ?? 'auto';
    const limit = params.textChunkLimit ?? 4000;
    const rendered = renderReply({ text: result.finalText, mode: renderMode, limit });

    await params.send.sendReply({
      chatId: inbound.chat_id,
      replyToMessageId: inbound.message_id,
      modeUsed: rendered.modeUsed,
      chunks: rendered.chunks,
    });
    replySent = true;

    store.markMessageProcessed({
      messageId: inbound.message_id,
      chatId: inbound.chat_id,
      createdAt: Date.now(),
    });
  } finally {
    if (replySent) {
      // Remove typing indicator only after a real reply is delivered.
      void ackPromise.then(async (ack) => {
        if (!ack) return;
        try {
          await params.send.clearAck(ack);
        } catch {
          // ignore cleanup errors
        }
      });
    }
  }
}
