import type { FeishuMessageEvent, FeishuMention, Inbound } from './types.js';

function parseTextContent(raw: string, messageType: string): string {
  try {
    const parsed = JSON.parse(raw) as any;
    if (messageType === 'text') {
      return String(parsed?.text ?? '').trim();
    }
    if (messageType === 'post') {
      return parsePostToText(parsed);
    }
    return raw;
  } catch {
    return raw;
  }
}

function parsePostToText(parsed: any): string {
  const title = typeof parsed?.title === 'string' ? parsed.title : '';
  const content = Array.isArray(parsed?.content) ? parsed.content : [];
  let out = '';
  if (title) out += `${title}\n\n`;

  for (const paragraph of content) {
    if (!Array.isArray(paragraph)) continue;
    for (const element of paragraph) {
      if (!element || typeof element !== 'object') continue;
      const tag = (element as any).tag;
      if (tag === 'text') out += String((element as any).text ?? '');
      else if (tag === 'a') out += String((element as any).text ?? (element as any).href ?? '');
      else if (tag === 'at') out += `@${String((element as any).user_name ?? (element as any).user_id ?? '')}`;
      else if (tag === 'img') out += '[image]';
    }
    out += '\n';
  }
  return out.trim() || '[rich post]';
}

function checkMentionedBot(mentions: FeishuMention[] | undefined, botOpenId?: string): boolean {
  const ms = mentions ?? [];
  if (ms.length === 0) return false;
  if (!botOpenId) return true;
  return ms.some((m) => m.id.open_id === botOpenId);
}

function stripMentions(text: string, mentions: FeishuMention[] | undefined): string {
  if (!text) return '';
  const ms = mentions ?? [];
  let out = text;
  for (const m of ms) {
    // Remove both human-readable "@name" and the mention placeholder key if present.
    if (m.name) out = out.replace(new RegExp(`@${escapeRegExp(m.name)}\\s*`, 'g'), '').trim();
    if (m.key) out = out.replace(new RegExp(escapeRegExp(m.key), 'g'), '').trim();
  }
  return out.trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseInboundMessage(event: FeishuMessageEvent, opts: { botOpenId?: string } = {}): Inbound {
  const messageType = event.message.message_type;
  const rawContent = event.message.content;
  const textWithMentions = parseTextContent(rawContent, messageType);
  const mentionedBot = checkMentionedBot(event.message.mentions, opts.botOpenId);
  const text = stripMentions(textWithMentions, event.message.mentions);

  return {
    chat_id: event.message.chat_id,
    chat_type: event.message.chat_type,
    message_id: event.message.message_id,
    sender_open_id: event.sender.sender_id.open_id,
    sender_user_id: event.sender.sender_id.user_id,
    message_type: messageType,
    raw_content: rawContent,
    text,
    mentioned_bot: mentionedBot,
    reply_to_message_id: event.message.parent_id,
  };
}

