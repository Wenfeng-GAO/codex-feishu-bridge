import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  formatFeishuThreadTitle,
  normalizeSessionOriginatorForDesktop,
  upsertCodexThreadTitle,
} from '../../src/codex/app_index.js';
import type { Inbound } from '../../src/feishu/types.js';

describe('codex/app_index', () => {
  it('formats title from inbound message', () => {
    const inbound: Inbound = {
      chat_id: 'oc_123',
      chat_type: 'group',
      message_id: 'm1',
      sender_open_id: 'ou_1',
      message_type: 'text',
      raw_content: '{"text":"hello"}',
      text: 'hello from feishu',
      mentioned_bot: true,
    };
    expect(formatFeishuThreadTitle(inbound)).toBe('Feishu group oc_123: hello from feishu');
  });

  it('upserts missing thread title and keeps existing title unchanged', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-app-index-'));
    const file = path.join(dir, '.codex-global-state.json');
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          'thread-titles': {
            titles: {
              t_existing: 'Existing Title',
            },
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    const first = upsertCodexThreadTitle({ statePath: file, threadId: 't1', title: 'Feishu DM ou_xxx: hi' });
    const second = upsertCodexThreadTitle({ statePath: file, threadId: 't_existing', title: 'New Title' });
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(parsed['thread-titles'].titles.t1).toBe('Feishu DM ou_xxx: hi');
    expect(parsed['thread-titles'].titles.t_existing).toBe('Existing Title');
  });

  it('normalizes session meta originator to Codex Desktop', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-originator-'));
    const dayDir = path.join(dir, '2026', '02', '20');
    fs.mkdirSync(dayDir, { recursive: true });
    const threadId = '019c7698-a822-7a03-9aa0-96a9f17af6e1';
    const file = path.join(dayDir, `rollout-2026-02-20T10-00-00-${threadId}.jsonl`);
    const first = {
      timestamp: '2026-02-20T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: threadId,
        cwd: '/Users/wenfeng/Documents/code',
        originator: 'codex_exec',
        source: 'exec',
      },
    };
    fs.writeFileSync(file, `${JSON.stringify(first)}\n{"type":"turn.started"}\n`, 'utf-8');

    const changed = normalizeSessionOriginatorForDesktop({ threadId, sessionsDir: dir });
    const changedAgain = normalizeSessionOriginatorForDesktop({ threadId, sessionsDir: dir });
    const updatedFirst = JSON.parse(fs.readFileSync(file, 'utf-8').split('\n')[0]);

    expect(changed).toBe(true);
    expect(changedAgain).toBe(false);
    expect(updatedFirst.payload.originator).toBe('Codex Desktop');
    expect(updatedFirst.payload.source).toBe('vscode');
  });

  it('normalizes source to vscode even when originator is already Codex Desktop', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-session-source-'));
    const dayDir = path.join(dir, '2026', '02', '20');
    fs.mkdirSync(dayDir, { recursive: true });
    const threadId = '019c7698-a822-7a03-9aa0-96a9f17af6e2';
    const file = path.join(dayDir, `rollout-2026-02-20T10-00-00-${threadId}.jsonl`);
    const first = {
      timestamp: '2026-02-20T10:00:00.000Z',
      type: 'session_meta',
      payload: {
        id: threadId,
        cwd: '/Users/wenfeng/Documents/code',
        originator: 'Codex Desktop',
        source: 'exec',
      },
    };
    fs.writeFileSync(file, `${JSON.stringify(first)}\n{"type":"turn.started"}\n`, 'utf-8');

    const changed = normalizeSessionOriginatorForDesktop({ threadId, sessionsDir: dir });
    const updatedFirst = JSON.parse(fs.readFileSync(file, 'utf-8').split('\n')[0]);

    expect(changed).toBe(true);
    expect(updatedFirst.payload.originator).toBe('Codex Desktop');
    expect(updatedFirst.payload.source).toBe('vscode');
  });
});
