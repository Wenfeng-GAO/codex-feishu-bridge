import type { Inbound } from '../feishu/types.js';

export function buildCodexPrompt(inbound: Inbound): string {
  const speaker = inbound.sender_name ?? inbound.sender_open_id ?? inbound.sender_user_id ?? 'user';
  const scope = inbound.chat_type === 'group' ? `Feishu group ${inbound.chat_id}` : `Feishu DM`;
  const body = inbound.text || '';
  return `[${scope}] ${speaker}: ${body}`.trim();
}

