export type CodexJsonlResult = {
  threadId?: string;
  finalText?: string;
};

export function parseCodexJsonlLine(line: string): any | undefined {
  if (!line || !line.trim()) return undefined;
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

export function parseCodexJsonl(lines: string[]): CodexJsonlResult {
  let threadId: string | undefined;
  let finalText: string | undefined;

  for (const line of lines) {
    const obj = parseCodexJsonlLine(line);
    if (!obj) continue;

    if (obj?.type === 'thread.started' && typeof obj.thread_id === 'string') {
      threadId = obj.thread_id;
      continue;
    }

    if (obj?.type === 'item.completed') {
      const item = obj.item;
      if (item?.type === 'agent_message' && typeof item.text === 'string') {
        finalText = item.text;
      }
    }
  }

  return { threadId, finalText };
}
