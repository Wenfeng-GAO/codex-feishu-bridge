import { runReplay, runService } from './app.js';
import { loadConfig } from './config.js';
import { createFeishuApi, sendImage } from './feishu/send.js';
import { runDoctorCli } from './doctor/cli.js';

type Argv = string[];

function popFlag(argv: Argv, name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const v = argv[idx + 1];
  argv.splice(idx, 2);
  return v;
}

function hasFlag(argv: Argv, name: string): boolean {
  const idx = argv.indexOf(name);
  if (idx === -1) return false;
  argv.splice(idx, 1);
  return true;
}

function usage(): string {
  return [
    'Usage:',
    '  codex-feishu-bridge [--config <path>] [--dry-run] [--bot-open-id <id>] [--codex-path <path>]',
    '  codex-feishu-bridge --replay <fixture.json> [--config <path>] [--dry-run] [--bot-open-id <id>] [--codex-path <path>]',
    '  codex-feishu-bridge doctor --config <path> [--codex-path <path>]',
    '  codex-feishu-bridge send-image --image <path> [--open-id <id> | --chat-id <id>] [--config <path>]',
  ].join('\n');
}

export async function main(argv: string[]): Promise<number> {
  const args = [...argv];

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    return 0;
  }

  if (args[0] === 'doctor') {
    args.shift();
    return await runDoctorCli(args);
  }

  if (args[0] === 'send-image') {
    args.shift();
    const imagePath = popFlag(args, '--image');
    const openId = popFlag(args, '--open-id');
    const chatId = popFlag(args, '--chat-id');
    const configPath = popFlag(args, '--config');
    if (!imagePath) {
      console.error('missing --image <path>');
      return 2;
    }
    if (!openId && !chatId) {
      console.error('missing --open-id or --chat-id');
      return 2;
    }
    const cfg = loadConfig({ configPath });
    const api = createFeishuApi(cfg);
    await sendImage({
      api,
      receiveIdType: openId ? 'open_id' : 'chat_id',
      receiveId: openId ?? chatId ?? '',
      imagePath,
    });
    console.log(JSON.stringify({ sent: true }, null, 2));
    return 0;
  }

  const configPath = popFlag(args, '--config');
  const replay = popFlag(args, '--replay');
  const botOpenId = popFlag(args, '--bot-open-id');
  const codexPath = popFlag(args, '--codex-path');
  const dryRun = hasFlag(args, '--dry-run');

  if (args.length > 0) {
    console.error(`unknown args: ${args.join(' ')}`);
    console.error(usage());
    return 2;
  }

  if (replay) {
    const r = await runReplay({ configPath, fixturePath: replay, botOpenId, codexPath, dryRun });
    console.log(JSON.stringify({ sent: r.sent }, null, 2));
    return 0;
  }

  await runService({ configPath, botOpenId, codexPath, dryRun });
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err);
      process.exitCode = 1;
    },
  );
}
