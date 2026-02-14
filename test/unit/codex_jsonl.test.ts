import { describe, expect, it } from 'vitest';

import { parseCodexJsonl } from '../../src/codex/jsonl.js';

describe('codex/jsonl', () => {
  it('extracts thread_id and final agent message', () => {
    const lines = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"final"}}',
    ];
    const r = parseCodexJsonl(lines);
    expect(r.threadId).toBe('t1');
    expect(r.finalText).toBe('final');
  });
});

