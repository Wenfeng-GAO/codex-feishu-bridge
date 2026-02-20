import { spawn } from 'node:child_process';

import { parseCodexJsonl, parseCodexJsonlLine } from './jsonl.js';

export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access';

export type RunCodexParams = {
  codexPath?: string; // default: "codex"
  threadId?: string;
  workspace: string;
  sandbox: CodexSandbox;
  model?: string;
  prompt: string;
  timeoutMs?: number; // default: 10min
  onEvent?: (event: unknown) => void;
};

export type RunCodexResult = {
  threadId: string;
  finalText: string;
  rawJsonl: string[];
};

export async function runCodex(params: RunCodexParams): Promise<RunCodexResult> {
  const codexPath = params.codexPath ?? 'codex';
  const timeoutMs = params.timeoutMs ?? 10 * 60 * 1000;

  const args: string[] = [];
  if (params.threadId) {
    args.push('exec', 'resume', '--skip-git-repo-check', '--json');
    if (params.sandbox === 'workspace-write') args.push('--full-auto');
    if (params.sandbox === 'danger-full-access') args.push('--dangerously-bypass-approvals-and-sandbox');
    if (params.model && params.model.trim()) args.push('--model', params.model.trim());
    args.push(params.threadId, params.prompt);
  } else {
    args.push('exec');
    args.push('--skip-git-repo-check', '--json', '-C', params.workspace);
    if (params.sandbox === 'danger-full-access') {
      args.push('--dangerously-bypass-approvals-and-sandbox');
    } else {
      args.push('--sandbox', params.sandbox);
    }
    if (params.model && params.model.trim()) args.push('--model', params.model.trim());
    args.push(params.prompt);
  }

  const child = spawn(codexPath, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  const stdoutLines: string[] = [];
  const stderrChunks: string[] = [];
  let stdoutBuffer = '';

  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const parts = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = parts.pop() ?? '';

    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line) continue;
      stdoutLines.push(line);
      const event = parseCodexJsonlLine(line);
      if (!event) continue;
      try {
        params.onEvent?.(event);
      } catch {
        // ignore progress callback failures
      }
    }
  });

  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => stderrChunks.push(chunk));

  const code: number = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (c: number | null) => resolve(c ?? 0));
  }).finally(() => clearTimeout(timer));

  const tail = stdoutBuffer.trim();
  if (tail) {
    stdoutLines.push(tail);
    const event = parseCodexJsonlLine(tail);
    if (event) {
      try {
        params.onEvent?.(event);
      } catch {
        // ignore progress callback failures
      }
    }
  }

  if (killed) {
    throw new Error(`codex timed out after ${timeoutMs}ms`);
  }
  if (code !== 0) {
    const stderr = stderrChunks.join('').trim();
    throw new Error(`codex exited ${code}${stderr ? `: ${stderr}` : ''}`);
  }

  const parsed = parseCodexJsonl(stdoutLines);
  if (!parsed.threadId) throw new Error('codex output missing thread_id');
  if (!parsed.finalText) throw new Error('codex output missing final agent message');

  return { threadId: parsed.threadId, finalText: parsed.finalText, rawJsonl: stdoutLines };
}
