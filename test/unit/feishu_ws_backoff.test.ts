import { describe, expect, it } from 'vitest';

import { computeReconnectBackoffMs } from '../../src/feishu/ws.js';

describe('feishu/ws: computeReconnectBackoffMs', () => {
  it('grows exponentially and caps', () => {
    const noJitter = { jitterRatio: 0, rand: () => 0.5 };
    expect(computeReconnectBackoffMs(0, { ...noJitter, baseMs: 100, capMs: 10_000 })).toBe(100);
    expect(computeReconnectBackoffMs(1, { ...noJitter, baseMs: 100, capMs: 10_000 })).toBe(200);
    expect(computeReconnectBackoffMs(2, { ...noJitter, baseMs: 100, capMs: 10_000 })).toBe(400);
    expect(computeReconnectBackoffMs(10, { ...noJitter, baseMs: 100, capMs: 500 })).toBe(500);
  });

  it('applies bounded jitter', () => {
    const baseMs = 1000;
    const capMs = 10_000;
    const jitterRatio = 0.2;
    const exp = 2000; // attempt=1

    const min = computeReconnectBackoffMs(1, { baseMs, capMs, jitterRatio, rand: () => 0 }); // -20%
    const max = computeReconnectBackoffMs(1, { baseMs, capMs, jitterRatio, rand: () => 0.999999 }); // +20%

    expect(min).toBeGreaterThanOrEqual(Math.round(exp * (1 - jitterRatio)));
    expect(max).toBeLessThanOrEqual(Math.round(exp * (1 + jitterRatio)));
  });
});

