import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema } from '../../src/config.js';
import type { Inbound } from '../../src/feishu/types.js';
import { handleInbound } from '../../src/handler/handle.js';
import { openStore } from '../../src/store/db.js';

describe('handler/handle ack behavior', () => {
  it('does not block execution when ackReceived never resolves', async () => {
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

    const inbound: Inbound = {
      chat_id: 'c_ack',
      chat_type: 'p2p',
      message_id: 'm_ack',
      sender_open_id: 'ou_sender',
      message_type: 'text',
      raw_content: '{"text":"hello"}',
      text: 'hello',
      mentioned_bot: false,
    };

    let codexRan = false;
    const sent: string[] = [];

    await handleInbound({
      cfg,
      store,
      inbound,
      runCodex: async () => {
        codexRan = true;
        return { threadId: 't_ack', finalText: 'ok' };
      },
      send: {
        ackReceived: async () => {
          return await new Promise<never>(() => {});
        },
        clearAck: async () => {},
        sendProgress: async () => {},
        sendReply: async ({ chunks }) => {
          sent.push(...chunks);
        },
      },
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    expect(codexRan).toBe(true);
    expect(sent).toEqual(['ok']);
    expect(store.isMessageProcessed('m_ack')).toBe(true);
  });

  it('uses Typing reaction for received ack', async () => {
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

    const inbound: Inbound = {
      chat_id: 'c_ack_typing',
      chat_type: 'p2p',
      message_id: 'm_ack_typing',
      sender_open_id: 'ou_sender',
      message_type: 'text',
      raw_content: '{"text":"hello"}',
      text: 'hello',
      mentioned_bot: false,
    };

    const ackCalls: Array<{ messageId: string; emojiType?: string }> = [];

    await handleInbound({
      cfg,
      store,
      inbound,
      runCodex: async () => ({ threadId: 't_ack_typing', finalText: 'ok' }),
      send: {
        ackReceived: async (p) => {
          ackCalls.push(p);
          return { messageId: p.messageId, reactionId: 'r_typing' };
        },
        clearAck: async () => {},
        sendProgress: async () => {},
        sendReply: async () => {},
      },
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    expect(ackCalls.length).toBe(1);
    expect(ackCalls[0]).toEqual({ messageId: 'm_ack_typing', emojiType: 'Typing' });
  });

  it('clears ack reaction after reply is sent', async () => {
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

    const inbound: Inbound = {
      chat_id: 'c_ack_clear',
      chat_type: 'p2p',
      message_id: 'm_ack_clear',
      sender_open_id: 'ou_sender',
      message_type: 'text',
      raw_content: '{"text":"hello"}',
      text: 'hello',
      mentioned_bot: false,
    };

    const clearCalls: Array<{ messageId: string; reactionId?: string }> = [];

    await handleInbound({
      cfg,
      store,
      inbound,
      runCodex: async () => ({ threadId: 't_ack_clear', finalText: 'ok' }),
      send: {
        ackReceived: async ({ messageId }) => ({ messageId, reactionId: 'r_clear' }),
        clearAck: async (p) => {
          clearCalls.push(p);
        },
        sendProgress: async () => {},
        sendReply: async () => {},
      },
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    // clearAck is scheduled asynchronously after sendReply.
    await new Promise((r) => setTimeout(r, 0));
    expect(clearCalls).toEqual([{ messageId: 'm_ack_clear', reactionId: 'r_clear' }]);
  });

  it('streams stage progress while codex is running', async () => {
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

    const inbound: Inbound = {
      chat_id: 'c_progress',
      chat_type: 'p2p',
      message_id: 'm_progress',
      sender_open_id: 'ou_sender',
      message_type: 'text',
      raw_content: '{"text":"hello"}',
      text: 'hello',
      mentioned_bot: false,
    };

    const progressCalls: string[] = [];

    await handleInbound({
      cfg,
      store,
      inbound,
      runCodex: async ({ onProgress }) => {
        onProgress?.('Session established');
        onProgress?.('Analyzing request');
        onProgress?.('Analyzing request');
        onProgress?.('Running tool: exec_command');
        return { threadId: 't_progress', finalText: 'ok' };
      },
      send: {
        ackReceived: async ({ messageId }) => ({ messageId, reactionId: 'r_progress' }),
        clearAck: async () => {},
        sendProgress: async ({ text }) => {
          progressCalls.push(text);
        },
        sendReply: async () => {},
      },
      renderMode: 'raw',
      textChunkLimit: 4000,
    });

    // sendProgress is fire-and-forget.
    await new Promise((r) => setTimeout(r, 0));
    expect(progressCalls).toEqual([
      'Task accepted, starting execution',
      'Session established',
      'Analyzing request',
      'Running tool: exec_command',
    ]);
  });
});
