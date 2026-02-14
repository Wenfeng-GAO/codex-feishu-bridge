import * as Lark from '@larksuiteoapi/node-sdk';

import type { BridgeConfig } from '../config.js';
import { resolveFeishuDomain } from './domain.js';

export function createFeishuClient(cfg: BridgeConfig): Lark.Client {
  const appId = cfg.feishu.app_id;
  const appSecret = cfg.feishu.app_secret;
  if (!appId || !appSecret) {
    throw new Error('Feishu app_id/app_secret not configured');
  }
  return new Lark.Client({
    appId,
    appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveFeishuDomain(cfg.feishu.domain),
  });
}
