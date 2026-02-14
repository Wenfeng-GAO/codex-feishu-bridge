import { spawn } from 'node:child_process';

import * as Lark from '@larksuiteoapi/node-sdk';

import type { BridgeConfig } from '../config.js';
import { loadConfig } from '../config.js';
import { runCodex } from '../codex/runner.js';
import { createFeishuClient } from '../feishu/client.js';
import { resolveFeishuDomain } from '../feishu/domain.js';
import { openStore } from '../store/db.js';
import { checkNodeVersion, checkPolicyHints, checkWorkspacePaths, type CheckResult } from './checks.js';

export type DoctorDeps = {
  env?: NodeJS.ProcessEnv;
  nodeVersion?: string;
  codexPath?: string;
  feishuProbe?: {
    getBotInfo(): Promise<{ name?: string; open_id?: string }>;
  };
};

async function probeCodexVersion(codexPath: string): Promise<{ ok: boolean; version?: string; err?: unknown }> {
  return await new Promise((resolve) => {
    const p = spawn(codexPath, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += String(d)));
    p.stderr.on('data', (d) => (err += String(d)));
    p.on('error', (e) => resolve({ ok: false, err: e }));
    p.on('close', (code) => {
      if (code === 0) resolve({ ok: true, version: out.trim() });
      else resolve({ ok: false, err: new Error(err.trim() || `exit code ${code}`) });
    });
  });
}

function pickProbeWorkspace(cfg: BridgeConfig): string {
  return cfg.routing.default_workspace;
}

async function probeFeishuBotInfo(cfg: BridgeConfig): Promise<{ name?: string; open_id?: string }> {
  const client = createFeishuClient(cfg);
  const res: any = await client.request({
    method: 'GET',
    url: '/open-apis/bot/v3/info',
  });
  const bot = res?.bot ?? res?.data?.bot ?? res?.data ?? res;
  return { name: bot?.name, open_id: bot?.open_id };
}

async function watchFeishuOnce(cfg: BridgeConfig, timeoutMs: number): Promise<{ message_id?: string; chat_id?: string }> {
  const appId = cfg.feishu.app_id;
  const appSecret = cfg.feishu.app_secret;
  if (!appId || !appSecret) throw new Error('Feishu app_id/app_secret not configured');

  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    domain: resolveFeishuDomain(cfg.feishu.domain),
    loggerLevel: Lark.LoggerLevel.info,
    autoReconnect: true,
  });

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        wsClient.close({ force: true });
      } catch {
        // ignore
      }
      reject(new Error(`timeout waiting for im.message.receive_v1 (${timeoutMs}ms)`));
    }, timeoutMs);

    const eventDispatcher = new Lark.EventDispatcher({}).register({
      'im.message.receive_v1': async (data: any) => {
        clearTimeout(timer);
        try {
          wsClient.close({ force: true });
        } catch {
          // ignore
        }
        resolve({ message_id: data?.message?.message_id, chat_id: data?.message?.chat_id });
      },
    });

    wsClient.start({ eventDispatcher }).catch((e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export async function runDoctor(params: { configPath: string; watch?: boolean }, deps: DoctorDeps = {}): Promise<{
  cfg?: BridgeConfig;
  results: CheckResult[];
  exitCode: number;
}> {
  const results: CheckResult[] = [];
  const nodeVersion = deps.nodeVersion ?? process.version;
  results.push(checkNodeVersion({ nodeVersion }));

  let cfg: BridgeConfig | undefined;
  try {
    cfg = loadConfig({ configPath: params.configPath, env: deps.env ?? process.env });
    results.push({ id: 'config.parse', status: 'PASS', message: params.configPath });
  } catch (e: any) {
    results.push({ id: 'config.parse', status: 'FAIL', message: String(e?.message ?? e) });
    return { results, exitCode: 1 };
  }

  results.push(...checkWorkspacePaths(cfg));

  try {
    openStore(cfg.storage.db_path);
    results.push({ id: 'storage.sqlite', status: 'PASS', message: cfg.storage.db_path });
  } catch (e: any) {
    results.push({ id: 'storage.sqlite', status: 'FAIL', message: String(e?.message ?? e) });
  }

  results.push(...checkPolicyHints(cfg));

  const codexPath = deps.codexPath ?? process.env.CODEX_PATH ?? 'codex';
  const versionProbe = await probeCodexVersion(codexPath);
  if (versionProbe.ok) {
    results.push({ id: 'codex.version', status: 'PASS', message: versionProbe.version || '(ok)' });
  } else {
    results.push({ id: 'codex.version', status: 'WARN', message: `codex --version failed (${String(versionProbe.err)})` });
  }

  try {
    const workspace = pickProbeWorkspace(cfg);
    const r = await runCodex({
      codexPath,
      workspace,
      sandbox: cfg.codex.sandbox_default,
      prompt: 'doctor probe: ping',
      timeoutMs: 10_000,
    });
    results.push({ id: 'codex.exec_probe', status: 'PASS', message: `thread=${r.threadId}` });
  } catch (e: any) {
    results.push({ id: 'codex.exec_probe', status: 'FAIL', message: String(e?.message ?? e) });
  }

  if (!cfg.feishu.app_id || !cfg.feishu.app_secret) {
    results.push({
      id: 'feishu.creds',
      status: 'WARN',
      message: 'missing feishu app_id/app_secret (set in config or env FEISHU_APP_ID/FEISHU_APP_SECRET)',
    });
  } else {
    try {
      const bot = deps.feishuProbe ? await deps.feishuProbe.getBotInfo() : await probeFeishuBotInfo(cfg);
      results.push({ id: 'feishu.bot_info', status: 'PASS', message: `bot=${bot.name ?? ''} open_id=${bot.open_id ?? ''}`.trim() });
    } catch (e: any) {
      results.push({ id: 'feishu.bot_info', status: 'FAIL', message: String(e?.message ?? e) });
    }
  }

  // Not fully automatable, but keep the checklist visible.
  results.push({
    id: 'feishu.event_subscription',
    status: 'WARN',
    message:
      'manual check: enable Socket/long-connection and subscribe event "im.message.receive_v1" in Feishu console; add bot to chat',
  });

  if (params.watch) {
    try {
      const seen = await watchFeishuOnce(cfg, 60_000);
      results.push({
        id: 'feishu.watch',
        status: 'PASS',
        message: `received im.message.receive_v1 message_id=${seen.message_id ?? ''} chat_id=${seen.chat_id ?? ''}`.trim(),
      });
    } catch (e: any) {
      results.push({ id: 'feishu.watch', status: 'FAIL', message: String(e?.message ?? e) });
    }
  }

  const exitCode = results.some((r) => r.status === 'FAIL') ? 1 : 0;
  return { cfg, results, exitCode };
}
