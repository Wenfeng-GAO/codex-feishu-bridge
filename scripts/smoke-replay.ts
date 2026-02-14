import { BridgeConfigSchema } from '../src/config.js';

// Smoke test runner placeholder.
// This intentionally does not connect to Feishu or spawn codex yet.
// It exists to keep "golden commands" runnable from day 1.

function main(): void {
  // Basic zod roundtrip sanity: schema is importable and usable.
  BridgeConfigSchema.safeParse({
    feishu: {},
    policy: {},
    routing: { default_workspace: '/tmp' },
    storage: {},
    codex: {},
  });
  console.log('smoke:replay OK');
}

main();
