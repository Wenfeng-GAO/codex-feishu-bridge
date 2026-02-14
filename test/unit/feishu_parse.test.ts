import { describe, expect, it } from 'vitest';

import { parseInboundMessage } from '../../src/feishu/parse.js';
import type { FeishuMessageEvent } from '../../src/feishu/types.js';

describe('feishu/parseInboundMessage', () => {
  it('parses text messages and strips mentions', () => {
    const e: FeishuMessageEvent = {
      sender: { sender_id: { open_id: 'ou_sender' } },
      message: {
        message_id: 'm1',
        chat_id: 'c1',
        chat_type: 'group',
        message_type: 'text',
        content: JSON.stringify({ text: '@Bot hello there' }),
        mentions: [
          { key: '<at user_id="ou_bot">Bot</at>', id: { open_id: 'ou_bot' }, name: 'Bot' },
        ],
      },
    };

    const inbound = parseInboundMessage(e, { botOpenId: 'ou_bot' });
    expect(inbound.text).toBe('hello there');
    expect(inbound.mentioned_bot).toBe(true);
  });

  it('parses post messages into plain text', () => {
    const post = {
      title: 'T',
      content: [
        [
          { tag: 'text', text: 'hello ' },
          { tag: 'a', text: 'link', href: 'https://x' },
        ],
      ],
    };

    const e: FeishuMessageEvent = {
      sender: { sender_id: { open_id: 'ou_sender' } },
      message: {
        message_id: 'm2',
        chat_id: 'c2',
        chat_type: 'p2p',
        message_type: 'post',
        content: JSON.stringify(post),
      },
    };

    const inbound = parseInboundMessage(e, { botOpenId: 'ou_bot' });
    expect(inbound.text).toContain('T');
    expect(inbound.text).toContain('hello');
    expect(inbound.text).toContain('link');
  });
});

