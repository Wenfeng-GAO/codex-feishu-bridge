import type { BridgeConfig } from '../config.js';
import type { SendAdapter } from '../handler/handle.js';
import { createFeishuApi, sendProgress, sendReply, type FeishuApi } from './send.js';

export function createSendAdapterFromApi(api: FeishuApi): SendAdapter {
  return {
    ackReceived: async ({ messageId, emojiType }) => {
      const r = await api.react({ messageId, emojiType: emojiType ?? 'Typing' });
      return { messageId, reactionId: r.reactionId };
    },
    clearAck: async ({ messageId, reactionId }) => {
      if (!reactionId) return;
      await api.unreact({ messageId, reactionId });
    },
    sendProgress: async ({ chatId, replyToMessageId, text }) => {
      await sendProgress({ api, chatId, replyToMessageId, text });
    },
    sendReply: async ({ chatId, replyToMessageId, modeUsed, chunks }) => {
      await sendReply({ api, chatId, replyToMessageId, modeUsed, chunks });
    },
  };
}

export function createFeishuSendAdapter(cfg: BridgeConfig): SendAdapter {
  const api = createFeishuApi(cfg);
  return createSendAdapterFromApi(api);
}
