import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Inbound } from '../feishu/types.js';

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 3)}...`;
}

export function codexGlobalStatePath(codexHome = path.join(os.homedir(), '.codex')): string {
  return path.join(codexHome, '.codex-global-state.json');
}

export function codexSessionsDir(codexHome = path.join(os.homedir(), '.codex')): string {
  return path.join(codexHome, 'sessions');
}

export function formatFeishuThreadTitle(inbound: Inbound): string {
  const scope =
    inbound.chat_type === 'group'
      ? `Feishu group ${inbound.chat_id}`
      : `Feishu DM ${inbound.sender_open_id ?? inbound.chat_id}`;
  const text = inbound.text.trim();
  if (!text) return scope;
  return `${scope}: ${truncate(text, 48)}`;
}

export function upsertCodexThreadTitle(params: {
  threadId: string;
  title: string;
  statePath?: string;
}): boolean {
  const statePath = params.statePath ?? codexGlobalStatePath();

  let state: any = {};
  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') state = parsed;
  } catch {
    // If file missing/corrupted, recover by writing minimal shape.
    state = {};
  }

  if (!state['thread-titles'] || typeof state['thread-titles'] !== 'object') {
    state['thread-titles'] = {};
  }
  if (
    !state['thread-titles'].titles ||
    typeof state['thread-titles'].titles !== 'object' ||
    Array.isArray(state['thread-titles'].titles)
  ) {
    state['thread-titles'].titles = {};
  }

  const titles = state['thread-titles'].titles as Record<string, string>;
  const existing = titles[params.threadId];
  if (typeof existing === 'string' && existing.trim()) return false;

  titles[params.threadId] = params.title;

  const tmp = `${statePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8');
  fs.renameSync(tmp, statePath);
  return true;
}

function walkSessionFiles(dir: string, out: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkSessionFiles(full, out);
      continue;
    }
    if (e.isFile() && e.name.endsWith('.jsonl')) out.push(full);
  }
  return out;
}

function findThreadSessionFile(threadId: string, sessionsDir: string): string | undefined {
  const needle = `${threadId}.jsonl`;
  const matches = walkSessionFiles(sessionsDir).filter((p) => p.endsWith(needle));
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const ma = fs.statSync(a).mtimeMs;
    const mb = fs.statSync(b).mtimeMs;
    return mb - ma;
  });
  return matches[0];
}

export function normalizeSessionOriginatorForDesktop(params: {
  threadId: string;
  sessionsDir?: string;
}): boolean {
  const sessionsDir = params.sessionsDir ?? codexSessionsDir();
  const file = findThreadSessionFile(params.threadId, sessionsDir);
  if (!file) return false;

  const raw = fs.readFileSync(file, 'utf-8');
  const lines = raw.split('\n');
  if (!lines[0] || !lines[0].trim()) return false;

  let first: any;
  try {
    first = JSON.parse(lines[0]);
  } catch {
    return false;
  }
  if (first?.type !== 'session_meta' || !first?.payload || typeof first.payload !== 'object') return false;
  const originatorOk = first.payload.originator === 'Codex Desktop';
  const sourceOk = first.payload.source === 'vscode';
  if (originatorOk && sourceOk) return false;

  first.payload.originator = 'Codex Desktop';
  // Codex App thread list defaults to interactive sources; normalize bridge threads to match.
  first.payload.source = 'vscode';
  lines[0] = JSON.stringify(first);

  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, lines.join('\n'), 'utf-8');
  fs.renameSync(tmp, file);
  return true;
}
