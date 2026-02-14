import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config.js';

describe('integration: config', () => {
  it('parses a realistic-ish config', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-feishu-bridge-it-'));
    const file = path.join(dir, 'config.toml');
    fs.writeFileSync(
      file,
      [
        '[feishu]',
        'domain = "feishu"',
        'connection_mode = "websocket"',
        '',
        '[policy]',
        'dm_policy = "pairing"',
        'group_policy = "allowlist"',
        'require_mention = true',
        'allow_from_user_open_ids = []',
        'allow_from_group_chat_ids = []',
        '',
        '[routing]',
        'default_workspace = "/Users/wenfeng/Documents/code"',
        '',
        '[storage]',
        'db_path = ":memory:"',
        '',
        '[codex]',
        'sandbox_default = "read-only"',
        'max_concurrency = 2',
        '',
      ].join('\n'),
      'utf-8',
    );

    const cfg = loadConfig({ configPath: file, env: {} });
    expect(cfg.feishu.connection_mode).toBe('websocket');
    expect(cfg.codex.max_concurrency).toBe(2);
    expect(cfg.storage.db_path).toBe(':memory:');
  });
});
