import { describe, expect, it } from 'vitest';

import { runDoctor } from '../../src/doctor/doctor.js';

describe('integration: doctor (offline)', () => {
  it('passes config parse + codex probe with stub, and warns on missing feishu creds', async () => {
    const r = await runDoctor(
      { configPath: 'fixtures/config/replay.toml' },
      { codexPath: './fixtures/codex/bin/codex' },
    );
    expect(r.results.find((x) => x.id === 'config.parse')?.status).toBe('PASS');
    expect(r.results.find((x) => x.id === 'codex.exec_probe')?.status).toBe('PASS');
    expect(r.results.find((x) => x.id === 'feishu.creds')?.status).toBe('WARN');
    expect(r.exitCode).toBe(0);
  });
});

