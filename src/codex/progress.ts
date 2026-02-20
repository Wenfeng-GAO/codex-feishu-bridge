function asObject(v: unknown): Record<string, unknown> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  return v as Record<string, unknown>;
}

function firstString(values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

function truncate(s: string, max = 40): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

function normalizeItemType(item: Record<string, unknown> | undefined): string | undefined {
  const t = firstString([item?.type, item?.item_type, item?.kind]);
  return t ? t.toLowerCase() : undefined;
}

function resolveToolName(item: Record<string, unknown> | undefined): string | undefined {
  const tool = asObject(item?.tool);
  const call = asObject(item?.call);
  const fn = asObject(item?.function);
  return firstString([item?.tool_name, item?.name, tool?.name, call?.name, fn?.name]);
}

export function extractProgressText(event: unknown): string | undefined {
  const e = asObject(event);
  if (!e) return undefined;

  const type = firstString([e.type]);
  const item = asObject(e.item);
  const itemType = normalizeItemType(item);

  if (type === 'thread.started') return 'Session established';
  if (type === 'turn.started') return 'Analyzing request';

  if (type === 'item.started') {
    if (itemType === 'agent_message') return 'Drafting response';
    if (itemType === 'reasoning' || itemType === 'analysis') return 'Planning next steps';
    if (itemType === 'tool_call' || itemType === 'tool_use' || itemType === 'function_call') {
      const name = resolveToolName(item);
      return name ? `Running tool: ${truncate(name)}` : 'Running tool';
    }
  }

  if (type === 'item.completed') {
    if (itemType === 'tool_call' || itemType === 'tool_use' || itemType === 'function_call') {
      const name = resolveToolName(item);
      return name ? `Tool finished: ${truncate(name)}` : 'Tool finished';
    }
    if (itemType === 'agent_message') return 'Response draft ready';
  }

  if (type === 'turn.completed') return 'Finalizing output';
  return undefined;
}
