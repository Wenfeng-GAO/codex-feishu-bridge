import type { BridgeConfig } from '../config.js';
import type { SendAdapter } from '../handler/handle.js';
import { createFeishuApi, sendReply, type FeishuApi } from './send.js';

export function createSendAdapterFromApi(api: FeishuApi): SendAdapter {
  return {
    ackReceived: async ({ messageId, emojiType }) => {
      await api.react({ messageId, emojiType: emojiType ?? 'OK' });
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
