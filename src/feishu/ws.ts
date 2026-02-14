import * as Lark from '@larksuiteoapi/node-sdk';

import type { BridgeConfig } from '../config.js';
import type { InboundDispatcher } from '../handler/dispatcher.js';
import { resolveFeishuDomain } from './domain.js';
import { parseInboundMessage } from './parse.js';
import type { FeishuMessageEvent } from './types.js';

export type InboundMessageHandler = (event: FeishuMessageEvent) => Promise<void>;

export function createInboundMessageHandler(params: {
  dispatcher: InboundDispatcher;
  botOpenId?: string;
}): InboundMessageHandler {
  return async (event: FeishuMessageEvent) => {
    const inbound = parseInboundMessage(event, { botOpenId: params.botOpenId });
    await params.dispatcher.dispatch(inbound);
  };
}

export type BackoffOpts = {
  baseMs?: number;
  capMs?: number;
  jitterRatio?: number;
  rand?: () => number; // default Math.random
};

export function computeReconnectBackoffMs(attempt: number, opts: BackoffOpts = {}): number {
  const base = opts.baseMs ?? 1_000;
  const cap = opts.capMs ?? 30_000;
  const jitterRatio = opts.jitterRatio ?? 0.2;
  const rand = opts.rand ?? Math.random;

  const exp = Math.min(cap, base * 2 ** Math.max(0, attempt));
  const r = rand(); // [0, 1)
  const jitter = exp * jitterRatio * (r * 2 - 1); // [-ratio, +ratio]
  return Math.max(0, Math.round(exp + jitter));
}

export type StartWsParams = {
  cfg: BridgeConfig;
  dispatcher: InboundDispatcher;
  botOpenId?: string;
  loggerLevel?: Lark.LoggerLevel;
};

export async function startFeishuWs(params: StartWsParams): Promise<{ wsClient: Lark.WSClient }> {
  const appId = params.cfg.feishu.app_id;
  const appSecret = params.cfg.feishu.app_secret;
  if (!appId || !appSecret) throw new Error('Feishu app_id/app_secret not configured');

  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveFeishuDomain(params.cfg.feishu.domain),
    loggerLevel: params.loggerLevel ?? Lark.LoggerLevel.info,
    autoReconnect: true,
  });

  const handler = createInboundMessageHandler({
    dispatcher: params.dispatcher,
    botOpenId: params.botOpenId,
  });

  // SDK sample uses 'im.message.receive_v1'. Some builds also accept snake_case.
  const eventDispatcher = new Lark.EventDispatcher({}).register({
    'im.message.receive_v1': handler as any,
    im_message_receive_v1: handler as any,
  });

  await wsClient.start({ eventDispatcher });
  return { wsClient };
}

export async function startFeishuWsWithRetry(
  params: StartWsParams & { maxAttempts?: number; backoff?: BackoffOpts },
): Promise<{ wsClient: Lark.WSClient }> {
  const maxAttempts = params.maxAttempts ?? Number.POSITIVE_INFINITY;
  let attempt = 0;
  let lastErr: unknown = undefined;

  while (attempt < maxAttempts) {
    try {
      return await startFeishuWs(params);
    } catch (e) {
      attempt += 1;
      lastErr = e;
      if (attempt >= maxAttempts) break;
      const delayMs = computeReconnectBackoffMs(attempt, params.backoff);
      console.warn(`[ws] start failed, retrying in ${delayMs}ms`, e);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastErr ?? new Error('WS start failed');
}
