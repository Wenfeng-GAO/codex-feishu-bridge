import { describe, expect, it } from 'vitest';

import { sendReply } from '../../src/feishu/send.js';

describe('feishu/sendReply', () => {
  it('sends chunks as top-level messages via create', async () => {
    const calls: string[] = [];
    const api = {
      react: async () => {
        calls.push('react');
      },
      reply: async () => {
        calls.push('reply');
      },
      create: async () => {
        calls.push('create');
      },
    };

    await sendReply({
      api,
      chatId: 'c',
      replyToMessageId: 'm',
      modeUsed: 'raw',
      chunks: ['a', 'b'],
    });

    expect(calls).toEqual(['create', 'create']);
  });
});
