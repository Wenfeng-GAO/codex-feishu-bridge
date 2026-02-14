import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as TOML from '@iarna/toml';
import { z } from 'zod';

const DomainSchema = z.union([z.enum(['feishu', 'lark']), z.string().url().startsWith('https://')]);
const ConnectionModeSchema = z.enum(['websocket']); // MVP: websocket only.

export const BridgeConfigSchema = z
  .object({
    feishu: z.object({
      app_id: z.string().min(1).optional(),
      app_secret: z.string().min(1).optional(),
      domain: DomainSchema.default('feishu'),
      connection_mode: ConnectionModeSchema.default('websocket'),
    }),
    policy: z.object({
      dm_policy: z.enum(['pairing', 'allowlist', 'open']).default('pairing'),
      group_policy: z.enum(['allowlist', 'open', 'disabled']).default('allowlist'),
      require_mention: z.boolean().default(true),
      allow_from_user_open_ids: z.array(z.string().min(1)).default([]),
      allow_from_group_chat_ids: z.array(z.string().min(1)).default([]),
    }),
    routing: z.object({
      default_workspace: z.string().min(1),
      chat_to_workspace: z.record(z.string(), z.string()).default({}),
      // Explicit allowlist of workspaces. If empty, allow only default_workspace + mapped ones.
      workspace_allowlist: z.array(z.string().min(1)).default([]),
    }),
    codex: z.object({
      sandbox_default: z.enum(['read-only', 'workspace-write']).default('read-only'),
      model: z.string().default(''),
      max_concurrency: z.number().int().positive().default(4),
    }),
  })
  .strict();

export type BridgeConfig = z.infer<typeof BridgeConfigSchema>;

export function defaultConfigPath(): string {
  return path.join(os.homedir(), '.codex', 'feishu-bridge', 'config.toml');
}

export type LoadConfigOpts = {
  configPath?: string;
  env?: NodeJS.ProcessEnv;
};

export function loadConfig(opts: LoadConfigOpts = {}): BridgeConfig {
  const env = opts.env ?? process.env;
  const configPath = opts.configPath ?? defaultConfigPath();

  const rawToml = fs.readFileSync(configPath, 'utf-8');
  const parsed = TOML.parse(rawToml) as unknown;
  const cfg = BridgeConfigSchema.parse(parsed);

  // Allow env overrides for secrets (so config can omit them).
  const appId = (env.FEISHU_APP_ID ?? '').trim();
  const appSecret = (env.FEISHU_APP_SECRET ?? '').trim();
  if (appId) cfg.feishu.app_id = appId;
  if (appSecret) cfg.feishu.app_secret = appSecret;

  return cfg;
}

