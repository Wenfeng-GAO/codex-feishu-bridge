import type { BridgeConfig } from '../config.js';
import type { Inbound } from './types.js';

export type PolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | 'group_disabled'
        | 'group_not_allowlisted'
        | 'dm_not_allowlisted'
        | 'require_mention'
        | 'missing_sender_open_id';
      record_only?: boolean;
    };

export function evaluateInboundPolicy(cfg: BridgeConfig, inbound: Inbound): PolicyDecision {
  const isGroup = inbound.chat_type === 'group';

  if (isGroup) {
    if (cfg.policy.group_policy === 'disabled') {
      return { allowed: false, reason: 'group_disabled' };
    }
    if (
      cfg.policy.group_policy === 'allowlist' &&
      !cfg.policy.allow_from_group_chat_ids.includes(inbound.chat_id)
    ) {
      return { allowed: false, reason: 'group_not_allowlisted' };
    }
    if (cfg.policy.require_mention && !inbound.mentioned_bot) {
      // Future: record to history instead of dropping completely.
      return { allowed: false, reason: 'require_mention', record_only: true };
    }
    return { allowed: true };
  }

  // DM
  if (!inbound.sender_open_id) {
    return { allowed: false, reason: 'missing_sender_open_id' };
  }

  if (cfg.policy.dm_policy === 'open') {
    return { allowed: true };
  }

  // MVP: treat pairing as allowlist gate (pairing flow added later).
  const allow = cfg.policy.allow_from_user_open_ids.includes(inbound.sender_open_id);
  if (!allow) {
    return { allowed: false, reason: 'dm_not_allowlisted' };
  }

  return { allowed: true };
}

