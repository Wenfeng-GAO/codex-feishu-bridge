import fs from 'node:fs';
import path from 'node:path';

import type { BridgeConfig } from '../config.js';

export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

export type CheckResult = {
  id: string;
  status: CheckStatus;
  message: string;
};

export function parseNodeMajor(version: string): number | null {
  const m = /^v(\d+)\./.exec(version.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function checkNodeVersion(params: { nodeVersion: string; minMajor?: number }): CheckResult {
  const minMajor = params.minMajor ?? 20;
  const major = parseNodeMajor(params.nodeVersion);
  if (major == null) return { id: 'node.version', status: 'WARN', message: `unable to parse node version: ${params.nodeVersion}` };
  if (major < minMajor) {
    return { id: 'node.version', status: 'FAIL', message: `node ${params.nodeVersion} < v${minMajor}.x (please upgrade)` };
  }
  return { id: 'node.version', status: 'PASS', message: `node ${params.nodeVersion}` };
}

export function checkPolicyHints(cfg: BridgeConfig): CheckResult[] {
  const out: CheckResult[] = [];

  if (cfg.policy.group_policy === 'allowlist' && cfg.policy.allow_from_group_chat_ids.length === 0) {
    out.push({
      id: 'policy.group_allowlist',
      status: 'WARN',
      message: 'group_policy=allowlist but allow_from_group_chat_ids is empty (no group messages will be handled)',
    });
  }

  if (cfg.policy.dm_policy !== 'open' && cfg.policy.allow_from_user_open_ids.length === 0) {
    out.push({
      id: 'policy.dm_allowlist',
      status: 'WARN',
      message: `dm_policy=${cfg.policy.dm_policy} but allow_from_user_open_ids is empty (DM may be blocked or require pairing flow)`,
    });
  }

  return out;
}

export function checkWorkspacePaths(cfg: BridgeConfig): CheckResult[] {
  const out: CheckResult[] = [];
  const paths = new Set<string>([cfg.routing.default_workspace, ...Object.values(cfg.routing.chat_to_workspace)]);

  for (const p of paths) {
    const abs = path.resolve(p);
    try {
      const st = fs.statSync(abs);
      if (!st.isDirectory()) {
        out.push({ id: `workspace.exists:${abs}`, status: 'FAIL', message: `not a directory: ${abs}` });
      } else {
        out.push({ id: `workspace.exists:${abs}`, status: 'PASS', message: abs });
      }
    } catch {
      out.push({ id: `workspace.exists:${abs}`, status: 'FAIL', message: `missing workspace path: ${abs}` });
    }
  }

  return out;
}

