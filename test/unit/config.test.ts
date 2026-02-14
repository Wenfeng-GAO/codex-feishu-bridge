import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema, loadConfig } from '../../src/config.js';

describe('BridgeConfigSchema', () => {
  it('injects defaults', () => {
    const cfg = BridgeConfigSchema.parse({
      feishu: {},
      policy: {},
      routing: { default_workspace: '/tmp' },
      storage: {},
      codex: {},
    });
    expect(cfg.feishu.domain).toBe('feishu');
    expect(cfg.feishu.connection_mode).toBe('websocket');
    expect(cfg.policy.dm_policy).toBe('pairing');
    expect(cfg.policy.group_policy).toBe('allowlist');
    expect(cfg.policy.require_mention).toBe(true);
    expect(cfg.codex.sandbox_default).toBe('read-only');
    expect(cfg.storage.db_path).toMatch(/state\.sqlite3$/);
  });
});

describe('loadConfig', () => {
  it('loads TOML and allows env overrides for app_id/app_secret', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-feishu-bridge-'));
    const file = path.join(dir, 'config.toml');
    fs.writeFileSync(
      file,
      [
        '[feishu]',
        'domain = "feishu"',
        '',
        '[policy]',
        'dm_policy = "pairing"',
        '',
        '[routing]',
        'default_workspace = "/tmp"',
        '',
        '[codex]',
        'sandbox_default = "read-only"',
        '',
      ].join('\n'),
      'utf-8',
    );

    const cfg = loadConfig({
      configPath: file,
      env: { FEISHU_APP_ID: 'cli_xxx', FEISHU_APP_SECRET: 'yyy' },
    });

    expect(cfg.feishu.app_id).toBe('cli_xxx');
    expect(cfg.feishu.app_secret).toBe('yyy');
  });
});
