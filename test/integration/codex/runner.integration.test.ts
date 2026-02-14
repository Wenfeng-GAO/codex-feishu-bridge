import { describe, expect, it } from 'vitest';

import { runCodex } from '../../../src/codex/runner.js';

describe('integration: codex runner (stubbed)', () => {
  it('runs exec and extracts threadId/finalText', async () => {
    const r = await runCodex({
      codexPath: './fixtures/codex/bin/codex',
      workspace: '/tmp',
      sandbox: 'read-only',
      prompt: 'hi',
      timeoutMs: 5_000,
    });
    expect(r.threadId).toBe('t_new');
    expect(r.finalText).toBe('NEW_OK');
  });

  it('runs exec resume and extracts threadId/finalText', async () => {
    const r = await runCodex({
      codexPath: './fixtures/codex/bin/codex',
      threadId: 't_any',
      workspace: '/tmp',
      sandbox: 'read-only',
      prompt: 'hi',
      timeoutMs: 5_000,
    });
    expect(r.threadId).toBe('t_resume');
    expect(r.finalText).toBe('RESUME_OK');
  });
});

