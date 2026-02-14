import { describe, expect, it } from 'vitest';

import { renderReply, shouldUseCard } from '../../src/feishu/render.js';

describe('feishu/render', () => {
  it('auto selects card for code fences', () => {
    expect(shouldUseCard('```js\nx\n```')).toBe(true);
    const r = renderReply({ text: '```js\nx\n```', mode: 'auto', limit: 4000 });
    expect(r.modeUsed).toBe('card');
  });

  it('chunks long text under limit', () => {
    const text = Array.from({ length: 100 }, () => 'line').join('\n');
    const r = renderReply({ text, mode: 'raw', limit: 50 });
    expect(r.chunks.length).toBeGreaterThan(1);
    for (const c of r.chunks) expect(c.length).toBeLessThanOrEqual(50);
  });

  it('does not break small code blocks', () => {
    const text = ['before', '```', 'a', 'b', '```', 'after'].join('\n');
    const r = renderReply({ text, mode: 'raw', limit: 1000 });
    expect(r.chunks).toHaveLength(1);
    expect(r.chunks[0]).toContain('```');
  });

  it('splits oversize code blocks while keeping fences', () => {
    const body = Array.from({ length: 200 }, (_, i) => `L${i}`).join('\n');
    const text = `\`\`\`\n${body}\n\`\`\``;
    const r = renderReply({ text, mode: 'raw', limit: 200 });
    expect(r.chunks.length).toBeGreaterThan(1);
    for (const c of r.chunks) {
      expect(c.startsWith('```')).toBe(true);
      expect(c.trimEnd().endsWith('```')).toBe(true);
      expect(c.length).toBeLessThanOrEqual(200);
    }
  });
});

