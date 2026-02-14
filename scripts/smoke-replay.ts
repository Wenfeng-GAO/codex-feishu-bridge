import { runReplay } from '../src/app.js';

async function main(): Promise<void> {
  const { sent } = await runReplay({
    configPath: 'fixtures/config/replay.toml',
    fixturePath: 'fixtures/feishu/im.message.receive_v1.text.json',
    codexPath: './fixtures/codex/bin/codex',
    botOpenId: 'ou_bot',
  });

  if (sent.length !== 1 || sent[0] !== 'NEW_OK') {
    throw new Error(`smoke: unexpected send output: ${JSON.stringify(sent)}`);
  }

  console.log('smoke:replay OK');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
