# codex-feishu-bridge

A Feishu/Lark Socket(WebSocket) bot that receives tasks from Feishu and runs them through the Codex CLI, then replies back to the same chat.

## Status

Early scaffold: config + tests + offline smoke runner are in place. See design docs for the full plan.

## Docs

- Product: `docs/design/PRODUCT.md`
- Development plan (with task checklist): `docs/design/DEVELOPMENT.md`
- Example config: `docs/design/config.example.toml`

## Local dev

```bash
cd codex-feishu-bridge
npm i
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run smoke:replay
```

## CLI

```bash
codex-feishu-bridge doctor --config <path>
codex-feishu-bridge --replay <fixture.json> --config <path>
codex-feishu-bridge send-image --image <path> --open-id <id> --config <path>
```
