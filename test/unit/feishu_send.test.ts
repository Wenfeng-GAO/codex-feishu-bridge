import { describe, expect, it } from 'vitest';

import { sendReply } from '../../src/feishu/send.js';

describe('feishu/sendReply', () => {
  it('prefers reply, falls back to create when reply fails', async () => {
    const calls: string[] = [];
    const api = {
      reply: async () => {
        calls.push('reply');
        throw new Error('nope');
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

    // For each chunk, reply fails then create is called.
    expect(calls).toEqual(['reply', 'create', 'reply', 'create']);
  });
});

