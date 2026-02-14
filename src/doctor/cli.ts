import { runDoctor } from './doctor.js';

function popFlag(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  const v = argv[idx + 1];
  argv.splice(idx, 2);
  return v;
}

function hasFlag(argv: string[], name: string): boolean {
  const idx = argv.indexOf(name);
  if (idx === -1) return false;
  argv.splice(idx, 1);
  return true;
}

export async function runDoctorCli(argv: string[]): Promise<number> {
  const args = [...argv];
  const configPath = popFlag(args, '--config');
  const codexPath = popFlag(args, '--codex-path');
  const watch = hasFlag(args, '--watch'); // reserved (manual)

  if (!configPath) {
    console.error('doctor requires --config <path>');
    return 2;
  }
  if (args.length > 0) {
    console.error(`unknown doctor args: ${args.join(' ')}`);
    return 2;
  }

  const r = await runDoctor({ configPath, watch }, { codexPath });
  for (const item of r.results) {
    console.log(`[${item.status}] ${item.id}: ${item.message}`);
  }
  return r.exitCode;
}

