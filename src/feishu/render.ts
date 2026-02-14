export type RenderMode = 'raw' | 'card' | 'auto';

export function shouldUseCard(text: string): boolean {
  if (!text) return false;
  // Fenced code blocks.
  if (/```[\s\S]*?```/.test(text)) return true;
  // Markdown tables (header + separator).
  if (/\|.+\|[\r\n]+\|[-:| ]+\|/.test(text)) return true;
  return false;
}

type Block =
  | { kind: 'code'; fence: string; info: string; lines: string[] }
  | { kind: 'text'; lines: string[] };

function parseBlocks(text: string): Block[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];

  let i = 0;
  let curText: string[] = [];

  const flushText = () => {
    if (curText.length === 0) return;
    blocks.push({ kind: 'text', lines: curText });
    curText = [];
  };

  while (i < lines.length) {
    const line = lines[i]!;
    const m = line.match(/^```(.*)$/);
    if (!m) {
      curText.push(line);
      i += 1;
      continue;
    }

    // Start fence.
    flushText();
    const info = m[1] ?? '';
    const codeLines: string[] = [];
    i += 1;
    while (i < lines.length) {
      const l = lines[i]!;
      if (l.startsWith('```')) {
        i += 1;
        break;
      }
      codeLines.push(l);
      i += 1;
    }
    blocks.push({ kind: 'code', fence: '```', info, lines: codeLines });
  }

  flushText();
  return blocks;
}

function blockToString(b: Block): string {
  if (b.kind === 'text') return b.lines.join('\n').trimEnd();
  const header = `${b.fence}${b.info}`.trimEnd();
  return [header, ...b.lines, b.fence].join('\n').trimEnd();
}

function splitOversizeTextBlock(lines: string[], limit: number): string[] {
  // Split by lines, keeping each chunk <= limit.
  const out: string[] = [];
  let cur = '';
  for (const l of lines) {
    const next = cur ? `${cur}\n${l}` : l;
    if (next.length <= limit) {
      cur = next;
      continue;
    }
    if (cur) out.push(cur);
    // Single line still too long: hard split.
    if (l.length > limit) {
      for (let i = 0; i < l.length; i += limit) out.push(l.slice(i, i + limit));
      cur = '';
    } else {
      cur = l;
    }
  }
  if (cur) out.push(cur);
  return out.map((s) => s.trimEnd()).filter(Boolean);
}

function splitOversizeCodeBlock(b: Extract<Block, { kind: 'code' }>, limit: number): string[] {
  const header = `${b.fence}${b.info}`.trimEnd();
  const footer = b.fence;
  const overhead = header.length + 1 + footer.length; // + newlines
  const bodyLimit = Math.max(1, limit - overhead - 2);

  const parts: string[] = [];
  let curLines: string[] = [];
  let curLen = 0;
  for (const l of b.lines) {
    const addLen = (curLines.length ? 1 : 0) + l.length;
    if (curLen + addLen <= bodyLimit) {
      curLines.push(l);
      curLen += addLen;
      continue;
    }
    parts.push([header, ...curLines, footer].join('\n').trimEnd());
    curLines = [l];
    curLen = l.length;
  }
  parts.push([header, ...curLines, footer].join('\n').trimEnd());
  return parts.filter(Boolean);
}

export type RenderResult = { modeUsed: Exclude<RenderMode, 'auto'>; chunks: string[] };

export function renderReply(params: { text: string; mode: RenderMode; limit: number }): RenderResult {
  const modeUsed = params.mode === 'auto' ? (shouldUseCard(params.text) ? 'card' : 'raw') : params.mode;
  const limit = Math.max(1, params.limit);

  const blocks = parseBlocks(params.text);
  const normalizedBlocks: string[] = [];
  for (const b of blocks) {
    const s = blockToString(b);
    if (!s) continue;
    if (s.length <= limit) {
      normalizedBlocks.push(s);
      continue;
    }
    if (b.kind === 'code') {
      normalizedBlocks.push(...splitOversizeCodeBlock(b, limit));
    } else {
      normalizedBlocks.push(...splitOversizeTextBlock(b.lines, limit));
    }
  }

  // Pack blocks into chunks.
  const chunks: string[] = [];
  let cur = '';
  for (const b of normalizedBlocks) {
    const next = cur ? `${cur}\n\n${b}` : b;
    if (next.length <= limit) {
      cur = next;
      continue;
    }
    if (cur) chunks.push(cur.trimEnd());
    if (b.length > limit) {
      // Should not happen due to splitting, but keep a hard fallback.
      chunks.push(b.slice(0, limit));
      cur = b.slice(limit);
    } else {
      cur = b;
    }
  }
  if (cur) chunks.push(cur.trimEnd());

  return { modeUsed, chunks: chunks.filter(Boolean) };
}

