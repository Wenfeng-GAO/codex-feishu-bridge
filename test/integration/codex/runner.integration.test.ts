import { describe, expect, it } from 'vitest';

import { runCodex } from '../../../src/codex/runner.js';

describe('integration: codex runner (stubbed)', () => {
  it('runs exec and extracts threadId/finalText', async () => {
    const eventTypes: string[] = [];
    const r = await runCodex({
      codexPath: './fixtures/codex/bin/codex',
      workspace: '/tmp',
      sandbox: 'read-only',
      prompt: 'hi',
      timeoutMs: 5_000,
      onEvent: (event) => {
        const type = (event as any)?.type;
        if (typeof type === 'string') eventTypes.push(type);
      },
    });
    expect(r.threadId).toBe('t_new');
    expect(r.finalText).toBe('NEW_OK');
    expect(eventTypes).toEqual(['thread.started', 'turn.started', 'item.completed', 'turn.completed']);
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

  it('passes dangerous bypass flag when sandbox is danger-full-access', async () => {
    const r1 = await runCodex({
      codexPath: './fixtures/codex/bin/codex',
      workspace: '/tmp',
      sandbox: 'danger-full-access',
      prompt: 'hi',
      timeoutMs: 5_000,
    });
    expect(r1.threadId).toBe('t_new_danger');
    expect(r1.finalText).toBe('NEW_DANGER_OK');

    const r2 = await runCodex({
      codexPath: './fixtures/codex/bin/codex',
      threadId: 't_any',
      workspace: '/tmp',
      sandbox: 'danger-full-access',
      prompt: 'hi',
      timeoutMs: 5_000,
    });
    expect(r2.threadId).toBe('t_resume_danger');
    expect(r2.finalText).toBe('RESUME_DANGER_OK');
  });
});
