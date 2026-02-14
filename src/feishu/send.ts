import type { BridgeConfig } from '../config.js';
import { createFeishuClient } from './client.js';

export type FeishuApi = {
  reply(params: { messageId: string; content: string; msgType: string }): Promise<void>;
  create(params: { chatId: string; content: string; msgType: string }): Promise<void>;
};

export function buildPostMarkdown(text: string): { msgType: string; content: string } {
  return {
    msgType: 'post',
    content: JSON.stringify({
      zh_cn: {
        content: [
          [
            {
              tag: 'md',
              text,
            },
          ],
        ],
      },
    }),
  };
}

export function buildInteractiveMarkdownCard(text: string): { msgType: string; content: string } {
  // Minimal interactive card with markdown.
  const card = {
    config: { wide_screen_mode: true },
    elements: [{ tag: 'markdown', content: text }],
  };
  return { msgType: 'interactive', content: JSON.stringify(card) };
}

export type SendReplyParams = {
  api: FeishuApi;
  chatId: string;
  replyToMessageId?: string;
  modeUsed: 'raw' | 'card';
  chunks: string[];
};

export async function sendReply(params: SendReplyParams): Promise<void> {
  const { api, chatId, replyToMessageId, chunks } = params;

  for (const chunk of chunks) {
    const payload =
      params.modeUsed === 'card' ? buildInteractiveMarkdownCard(chunk) : buildPostMarkdown(chunk);

    if (replyToMessageId) {
      try {
        await api.reply({ messageId: replyToMessageId, content: payload.content, msgType: payload.msgType });
        continue;
      } catch {
        // Fall back to create below.
      }
    }

    await api.create({ chatId, content: payload.content, msgType: payload.msgType });
  }
}

export function createFeishuApi(cfg: BridgeConfig): FeishuApi {
  const client = createFeishuClient(cfg);

  return {
    reply: async ({ messageId, content, msgType }) => {
      const res: any = await client.im.message.reply({
        path: { message_id: messageId },
        data: { content, msg_type: msgType },
      });
      if (res?.code !== 0) throw new Error(res?.msg || `reply failed code=${res?.code}`);
    },
    create: async ({ chatId, content, msgType }) => {
      const res: any = await client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: { receive_id: chatId, content, msg_type: msgType },
      });
      if (res?.code !== 0) throw new Error(res?.msg || `create failed code=${res?.code}`);
    },
  };
}
