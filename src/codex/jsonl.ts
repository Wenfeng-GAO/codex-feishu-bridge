export type CodexJsonlResult = {
  threadId?: string;
  finalText?: string;
};

export function parseCodexJsonl(lines: string[]): CodexJsonlResult {
  let threadId: string | undefined;
  let finalText: string | undefined;

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    let obj: any;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }

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

