import { describe, expect, it } from 'vitest';

import { extractProgressText } from '../../src/codex/progress.js';

describe('codex/progress', () => {
  it('maps lifecycle events to progress text', () => {
    expect(extractProgressText({ type: 'thread.started' })).toBe('Session established');
    expect(extractProgressText({ type: 'turn.started' })).toBe('Analyzing request');
    expect(extractProgressText({ type: 'turn.completed' })).toBe('Finalizing output');
  });

  it('maps tool events and includes tool name', () => {
    expect(extractProgressText({ type: 'item.started', item: { type: 'tool_call', name: 'exec_command' } })).toBe(
      'Running tool: exec_command',
    );
    expect(extractProgressText({ type: 'item.completed', item: { type: 'tool_call', name: 'exec_command' } })).toBe(
      'Tool finished: exec_command',
    );
  });

  it('returns undefined for unknown shapes', () => {
    expect(extractProgressText({ type: 'unknown.event' })).toBeUndefined();
    expect(extractProgressText(undefined)).toBeUndefined();
  });
});
