import { describe, expect, it } from 'vitest';

import type { BridgeConfig } from '../../src/config.js';
import { evaluateInboundPolicy } from '../../src/feishu/policy.js';
import type { Inbound } from '../../src/feishu/types.js';

function baseCfg(): BridgeConfig {
  return {
    feishu: { domain: 'feishu', connection_mode: 'websocket' },
    policy: {
      dm_policy: 'pairing',
      group_policy: 'allowlist',
      require_mention: true,
      allow_from_user_open_ids: [],
      allow_from_group_chat_ids: [],
    },
    routing: { default_workspace: '/tmp', chat_to_workspace: {}, workspace_allowlist: [] },
    storage: { db_path: ':memory:' },
    codex: { sandbox_default: 'read-only', model: '', max_concurrency: 4 },
  };
}

describe('feishu/policy', () => {
  it('denies group messages not in allowlist', () => {
    const cfg = baseCfg();
    const inbound: Inbound = {
      chat_id: 'oc_x',
      chat_type: 'group',
      message_id: 'm',
      message_type: 'text',
      raw_content: '',
      text: 'hi',
      mentioned_bot: true,
    };
    const d = evaluateInboundPolicy(cfg, inbound);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('group_not_allowlisted');
  });

  it('denies group messages without mention when require_mention=true', () => {
    const cfg = baseCfg();
    cfg.policy.allow_from_group_chat_ids = ['oc_ok'];
    const inbound: Inbound = {
      chat_id: 'oc_ok',
      chat_type: 'group',
      message_id: 'm',
      message_type: 'text',
      raw_content: '',
      text: 'hi',
      mentioned_bot: false,
    };
    const d = evaluateInboundPolicy(cfg, inbound);
    expect(d.allowed).toBe(false);
    if (!d.allowed) {
      expect(d.reason).toBe('require_mention');
      expect(d.record_only).toBe(true);
    }
  });

  it('allows DM when dm_policy=open', () => {
    const cfg = baseCfg();
    cfg.policy.dm_policy = 'open';
    const inbound: Inbound = {
      chat_id: 'c',
      chat_type: 'p2p',
      message_id: 'm',
      message_type: 'text',
      raw_content: '',
      text: 'hi',
      mentioned_bot: false,
      sender_open_id: 'ou_x',
    };
    const d = evaluateInboundPolicy(cfg, inbound);
    expect(d.allowed).toBe(true);
  });

  it('denies DM when pairing/allowlist and sender not allowlisted', () => {
    const cfg = baseCfg();
    cfg.policy.allow_from_user_open_ids = ['ou_allow'];
    const inbound: Inbound = {
      chat_id: 'c',
      chat_type: 'p2p',
      message_id: 'm',
      message_type: 'text',
      raw_content: '',
      text: 'hi',
      mentioned_bot: false,
      sender_open_id: 'ou_no',
    };
    const d = evaluateInboundPolicy(cfg, inbound);
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.reason).toBe('dm_not_allowlisted');
  });
});

