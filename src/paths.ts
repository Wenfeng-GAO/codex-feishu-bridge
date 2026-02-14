import os from 'node:os';
import path from 'node:path';

export function codexHomeDir(): string {
  return path.join(os.homedir(), '.codex');
}

export function feishuBridgeDir(): string {
  return path.join(codexHomeDir(), 'feishu-bridge');
}

export function feishuBridgeVarDir(): string {
  return path.join(feishuBridgeDir(), 'var');
}

export function defaultDbPath(): string {
  return path.join(feishuBridgeVarDir(), 'state.sqlite3');
}

