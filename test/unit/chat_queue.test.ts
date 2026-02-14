import { describe, expect, it } from 'vitest';

import { ChatSerialQueue } from '../../src/handler/queue.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('ChatSerialQueue', () => {
  it('runs tasks sequentially per chat_id', async () => {
    const q = new ChatSerialQueue();
    const trace: string[] = [];

    const p1 = q.enqueue('c1', async () => {
      trace.push('start1');
      await sleep(30);
      trace.push('end1');
      return 1;
    });
    const p2 = q.enqueue('c1', async () => {
      trace.push('start2');
      await sleep(1);
      trace.push('end2');
      return 2;
    });

    const [a, b] = await Promise.all([p1, p2]);
    expect([a, b]).toEqual([1, 2]);
    expect(trace).toEqual(['start1', 'end1', 'start2', 'end2']);
  });

  it('continues even if previous task failed', async () => {
    const q = new ChatSerialQueue();
    const trace: string[] = [];

    const p1 = q.enqueue('c1', async () => {
      trace.push('fail1');
      throw new Error('boom');
    });
    const p2 = q.enqueue('c1', async () => {
      trace.push('ok2');
      return 2;
    });

    await expect(p1).rejects.toThrow(/boom/);
    await expect(p2).resolves.toBe(2);
    expect(trace).toEqual(['fail1', 'ok2']);
  });
});

