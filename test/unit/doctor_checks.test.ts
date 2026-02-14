import { describe, expect, it } from 'vitest';

import { BridgeConfigSchema } from '../../src/config.js';
import { checkNodeVersion, checkPolicyHints, parseNodeMajor } from '../../src/doctor/checks.js';

describe('doctor/checks', () => {
  it('parses node major', () => {
    expect(parseNodeMajor('v25.1.0')).toBe(25);
    expect(parseNodeMajor('25.1.0')).toBe(null);
  });

  it('fails old node', () => {
    const r = checkNodeVersion({ nodeVersion: 'v18.0.0', minMajor: 20 });
    expect(r.status).toBe('FAIL');
  });

  it('warns on empty allowlists under allowlist policies', () => {
    const cfg = BridgeConfigSchema.parse({
      feishu: { domain: 'feishu', connection_mode: 'websocket' },
      policy: {
        dm_policy: 'allowlist',
        group_policy: 'allowlist',
        require_mention: true,
        allow_from_user_open_ids: [],
        allow_from_group_chat_ids: [],
      },
      routing: { default_workspace: '/tmp', chat_to_workspace: {}, workspace_allowlist: ['/tmp'] },
      storage: { db_path: ':memory:' },
      codex: { sandbox_default: 'read-only', model: '', max_concurrency: 4 },
    });

    const rs = checkPolicyHints(cfg);
    expect(rs.some((x) => x.id === 'policy.group_allowlist' && x.status === 'WARN')).toBe(true);
    expect(rs.some((x) => x.id === 'policy.dm_allowlist' && x.status === 'WARN')).toBe(true);
  });
});

