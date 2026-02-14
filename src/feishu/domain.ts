import * as Lark from '@larksuiteoapi/node-sdk';

export function resolveFeishuDomain(domain: string): Lark.Domain | string {
  if (domain === 'lark') return Lark.Domain.Lark;
  if (domain === 'feishu' || !domain) return Lark.Domain.Feishu;
  return domain.replace(/\/+$/, '');
}

