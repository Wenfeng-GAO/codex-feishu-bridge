# Codex Feishu 长连接任务机器人：开发设计文档

本文档目标：给出“可直接开工”的工程设计，复刻 OpenClaw Feishu(websocket) 的核心链路：`WSClient + EventDispatcher -> message handler -> route/session -> reply dispatcher`，但将“agent 引擎”替换为 `codex exec`。

## 1. 总体方案

实现形态：一个常驻进程 `codex-feishu-bridge`（Node.js），负责：
1. 飞书 Socket(WebSocket) 长连接收消息事件 `im.message.receive_v1`
2. 按策略过滤（dmPolicy / groupPolicy / requireMention / allowlists）
3. 路由到工作区与 Codex thread
4. 以子进程方式调用 `codex exec`/`codex exec resume` 执行
5. 将输出（最终或流式）回传飞书（text/post/card）

依赖选择（与 OpenClaw 对齐）：
- Feishu SDK：`@larksuiteoapi/node-sdk`（提供 `WSClient` 与 IM API）
- 配置校验：`zod`
- 状态存储：`better-sqlite3` 或 `sqlite3`（本机部署简单且可靠）

## 2. 代码结构（建议）

```
codex-feishu-bridge/
  src/
    config.ts
    feishu/
      client.ts
      ws.ts
      parse.ts
      send.ts
      policy.ts
      render.ts
    codex/
      runner.ts
      session.ts
      prompt.ts
    store/
      db.ts
      migrations/
    app.ts
  package.json
  README.md (可选：内部用)
```

### 2.1 config.ts
- 读取 `~/.codex/feishu-bridge/config.toml`
- 合并 env 覆盖（如 `FEISHU_APP_ID/FEISHU_APP_SECRET`）
- zod 校验 + 默认值注入

关键字段（与 OpenClaw 语义对齐）：
- `feishu.domain`：`feishu|lark|https://private.domain`
- `feishu.connection_mode`：只支持 `websocket`
- `policy.dm_policy`：`pairing|allowlist|open`
- `policy.group_policy`：`allowlist|open|disabled`
- `policy.require_mention`
- `policy.allow_from_user_open_ids[]`
- `policy.allow_from_group_chat_ids[]`
- `routing.default_workspace`
- `routing.chat_to_workspace{chat_id:path}`
- `codex.sandbox_default`：`read-only|workspace-write`

### 2.2 feishu/ws.ts
- 创建 `WSClient`，并用 `EventDispatcher.register()` 订阅：
  - `im.message.receive_v1`
  - 可选：`im.chat.member.bot.added_v1`（提示管理员）
- 断线重连策略：指数退避 + 抖动
- 去重：基于 `message_id`（持久化最近 N 条，或 sqlite 表 `processed_messages`）

对齐 OpenClaw：
- OpenClaw `monitor.ts` 使用 per-account WSClient map；这里先做单账号，后续扩展 `accounts`。

### 2.3 feishu/parse.ts
将 Feishu message event 统一抽象为：
```ts
type Inbound = {
  chat_id: string;
  chat_type: "p2p" | "group";
  message_id: string;
  sender_open_id?: string;
  sender_user_id?: string;
  sender_name?: string;   // 可选：contact API best-effort
  message_type: "text" | "post" | "image" | "file" | string;
  raw_content: string;    // JSON string
  text: string;           // 提取后的纯文本
  mentioned_bot: boolean;
  mention_targets?: Array<{ open_id?: string; name: string }>; // 转发@需求（可选）
  reply_to_message_id?: string; // parent_id
  quoted_text?: string;   // 通过 get message 补全（可选）
}
```

实现点（参考 OpenClaw `bot.ts`）：
- `text`：`JSON.parse(content).text`
- `post`：从富文本结构提取文本
- `mentioned_bot`：从 `mentions[]` 判断
- `stripBotMention`：删除 `@机器人` 占位符

### 2.4 feishu/policy.ts
实现策略判断（与 OpenClaw 对齐）：
- DM:
  - `open`：全放行
  - `allowlist`：只允许 `sender_open_id` 在 allowlist
  - `pairing`：第一次触发生成 pairing code，要求管理员批准（MVP 可简化为 allowlist）
- Group:
  - `disabled`：全拒绝
  - `allowlist`：chat_id 必须在 `allow_from_group_chat_ids`
  - `open`：允许所有群（但仍需 @）
- `require_mention`：群聊必须 @ 才执行

### 2.5 codex/session.ts
核心：将 `chat_id` 映射到：
- `workspace_path`
- `thread_id`
- `sandbox_policy`

建议 sqlite 表：
- `chat_sessions(chat_id TEXT PRIMARY KEY, workspace TEXT, thread_id TEXT, sandbox TEXT, updated_at INTEGER)`
- `processed_messages(message_id TEXT PRIMARY KEY, chat_id TEXT, created_at INTEGER)`
- `pairing_requests(sender_open_id TEXT PRIMARY KEY, code TEXT, approved INTEGER, created_at INTEGER)`（可选）

thread 创建策略：
- 如果 `thread_id` 为空：
  - 调用一次 `codex exec --json --skip-git-repo-check ...` 拿到 `thread.started.thread_id`
  - 不强依赖输出内容（可用一个短 prompt：`"Initialize session."`）

### 2.6 codex/runner.ts
用子进程跑 Codex：
- 新 thread：`codex exec ... --json -C <workspace> "<prompt>"`
- 续聊：`codex exec resume <thread_id> ... --json -C <workspace> "<prompt>"`

解析 JSONL 事件流：
- 捕捉 `thread.started` 获取/确认 thread_id
- 捕捉 `item.completed` 中的 `agent_message` 文本（最终答复）
- 可选：捕捉中间事件做流式回传（实现复杂度更高，MVP 可只回最终）

失败处理：
- 超时：kill 子进程并回传“超时”
- 非 0 exit：回传 stderr 摘要 + 关联 trace_id（日志里）

### 2.7 codex/prompt.ts
把飞书消息包装成稳定的提示词格式（借鉴 OpenClaw envelope 思路）：
- 指明来源：`Feishu group <chat_id>` / `Feishu DM <sender>`
- 在群聊里加 speaker label：`<sender_name>: <text>`
- 如果是 reply：附上 `quoted_text`
- 如果有 mention_targets：附上系统指令“回复会自动 @ 某些人”

### 2.8 feishu/send.ts + render.ts
发送策略：
- `reply` 优先（用 `im.message.reply`，`reply_to_message_id = inbound.message_id`）
- 超长切分（OpenClaw 默认 4000）：
  - 按段落/换行优先；代码块完整性优先
- `render_mode`：
  - `raw`：纯文本
  - `card`：interactive card（适合 Markdown）
  - `auto`：检测 ``` 或表格

（可选）typing indicator：
- 用 reaction 模拟开始/结束（OpenClaw `typing.ts`）

## 3. 多工作区路由（建议默认）
目的：让同一个机器人服务多个 repo/目录。

路由规则（从高到低）：
1. `routing.chat_to_workspace[chat_id]`
2. `routing.default_workspace`
3. （兜底）拒绝执行并提示管理员配置

管理员命令：
- `cwd /abs/path`：更新该 chat 的 workspace（仅 allowlist 管理员）

## 4. 安全设计
必须点：
- 白名单工作区：只允许配置文件列出的路径；禁止用户从消息里注入 `-C` 任意路径
- 默认只读：`codex --sandbox read-only`
- 同一 chat 串行：避免并发导致“把 A 的输出回给 B”
- 输出脱敏：不回传本地绝对路径/环境变量/密钥（可做简单 redaction）

## 5. 运维与部署

### 5.1 本机 macOS（推荐起步）
- 进程管理：`launchd`（后续补 plist）
- 日志：stdout/stderr 重定向到 `~/Library/Logs/codex-feishu-bridge.log`

### 5.2 内网 Linux
- systemd service
- 配置与密钥：`EnvironmentFile=` 或 vault

### 5.3 运行健康检查
- 暴露本地 `http://127.0.0.1:<port>/health`（可选，不对公网）
- 包含：WS 连接状态、队列长度、最后错误时间

## 6. 测试计划

单元测试：
- `parse.ts`：text/post/mentions/strip mention
- `policy.ts`：allowlist/requireMention 组合
- `render.ts`：chunking、auto 判定

集成测试（mock）：
- mock Feishu event payload -> runner stub -> verify send called with expected chunks

端到端（手工）：
1. 在 allowlist 群 @ 机器人：能收到回复
2. 非 allowlist 群：不触发
3. 连续 3 轮对话：能续聊（同一 thread）
4. kill bridge 重启：thread 映射仍在

## 7. 里程碑拆分（建议）
1. M1：WS 收消息 + policy + 仅最终回复（单账号、text）
2. M2：会话持久化 + resume + 管理命令（reset/cwd/status）
3. M3：card 渲染 + 输出分片优化 + typing indicator
4. M4：附件/引用消息 + 更强的安全审计与脱敏

## 8. 任务拆分（细粒度 + 可自动化验证）

目标：将开发拆到“每一步都能自动化验证”的粒度，优先让 Codex 自己能完成（实现 + UT + 集成测试 + CI 风格脚本），尽量减少你人工介入。

### 8.1 必要人工介入点（无法完全自动化）

以下步骤是“必须人工”的（其余尽量做到自动化/可回放）：
1. Feishu 开放平台创建自建应用，拿到 `app_id/app_secret`，并开启 Socket/长连接事件订阅、添加 `im.message.receive_v1` 等事件。
2. 将机器人拉入目标群/与机器人私聊一次（以产生真实消息事件）。
3. 在本机完成一次 `codex login`（若 Codex CLI 需要）。
4. 首次填写本地配置 `~/.codex/feishu-bridge/config.toml`（密钥不进入 repo），以及 allowlist/chat_id 映射。

为了尽量减少你参与：
- 代码层提供 `replay`/`dry-run` 模式，用 fixture 回放飞书事件（不需要真实飞书连接）即可跑通“从入站事件到回包”的全链路集成测试。
- 提供脚本打印“需要你手工粘贴/设置”的最少信息（例如提示你去哪拿 chat_id）。

### 8.2 验证金线（全程可运行的一组命令）

项目从第 1 天开始就应该能跑下面 5 条命令（每个任务完成后都维持通过）：
1. `npm run lint`
2. `npm run typecheck`
3. `npm run test:unit`
4. `npm run test:integration`
5. `npm run smoke:replay`（不连飞书、不跑真实 codex：用 stub）

### 8.3 测试分层（UT + 集成）

单元测试（UT）目标：不触网、不起子进程，纯函数/纯模块验证。
- 覆盖：`parse/policy/render/prompt/config` 等

集成测试（Integration）目标：用 stub/mock 把“模块组合”验证出来。
- Feishu：不连真实 WS；用“事件回放(replay)”或 fake dispatcher 触发 handler。
- Codex：不跑真实 `codex`；用 fake 二进制/脚本输出 JSONL（包含 `thread.started`、`item.completed`）。
- 存储：用 sqlite 临时文件或 `:memory:`。

端到端（E2E）目标：真实飞书 + 真实 codex（这是人工步骤，作为最终验收，不纳入每次自动化跑）。

### 8.4 任务清单（按依赖顺序）

下面每个 Task 都有：
- 产物：要新增/修改哪些模块
- UT：对应单测用例
- Integration：对应集成用例
- 自动验证：上述金线命令中，至少哪一条会新增覆盖

#### Task 0：仓库骨架与工具链（自动化优先）

产物：
- TypeScript Node 工程骨架（建议 Node 20+）
- `vitest`（或 `jest`）作为测试框架
- `eslint` + `prettier`（若你们有统一规范则复用）
- `npm scripts`：`lint/typecheck/test:unit/test:integration/smoke:replay`

UT：
- `config` 的最小样例解析（用 `config.example.toml`）

Integration：
- 空（先把工具链跑通）

自动验证：
- `npm run lint`、`npm run typecheck`、`npm run test:unit`

#### Task 1：配置加载与 Schema 校验（config.ts）

产物：
- `src/config.ts`：读取 `~/.codex/feishu-bridge/config.toml` + env 覆盖 + zod 默认值
- 输出一个“运行时配置对象”（不包含业务逻辑）

UT：
- 缺字段默认值注入
- 非法 enum/路径时报错信息可读
- `domain=feishu/lark/customUrl` 兼容

Integration：
- `smoke:replay` 可用配置启动到“加载成功”阶段

自动验证：
- `test:unit` 新增覆盖

#### Task 2：存储层（sqlite）与迁移（store/db.ts）

产物：
- sqlite 初始化与 migrations（最少：`chat_sessions`、`processed_messages`）
- 简单 DAO：get/set thread 映射、去重写入与查询

UT：
- `processed_messages` 去重：同 message_id 第二次应直接判重
- `chat_sessions` upsert：更新 workspace/sandbox/thread_id

Integration：
- 在 `smoke:replay` 中启用临时 sqlite 文件，跑完后断言写入了 chat->thread 映射

自动验证：
- `test:unit` + `test:integration`

#### Task 3：入站事件解析（feishu/parse.ts）

产物：
- 将飞书 `im.message.receive_v1` payload 解析为统一 `Inbound`
- 支持：`text`、`post`（富文本）两种（MVP）
- mention 检测与 strip

UT：
- `text` content 提取
- `post` content 提取（至少覆盖：标题、文本、@、链接）
- strip bot mention（按 mentions key 与 @name）
- mentioned_bot 判定（有 botOpenId 与无 botOpenId 两种）

Integration：
- replay fixture（text/post）走完整 handler，最终生成 codex prompt 中包含 `speaker:` 前缀

自动验证：
- `test:unit`、`smoke:replay`

#### Task 4：策略引擎（feishu/policy.ts）

产物：
- DM 与 Group 策略判断：`pairing/allowlist/open`、`allowlist/open/disabled`、`require_mention`
- 策略输出要包含“拒绝原因”（便于日志/回包）

UT：
- group allowlist：chat_id 不在 allowlist 时拒绝
- require_mention：未 @ 时拒绝（或仅记录历史，不触发执行）
- dm allowlist：sender 不在 allowlist 时拒绝

Integration：
- replay 同一条消息在不同策略下的结果（应触发/不触发 codex runner）

自动验证：
- `test:unit`、`test:integration`

#### Task 5：渲染与分片（feishu/render.ts）

产物：
- `render_mode=raw/card/auto` 判定
- chunking：按 4000 限制分片，尽量保持代码块完整

UT：
- auto：含 ``` 或表格时走 card，否则 raw
- chunking：超长文本拆成 N 片，每片 <= limit
- 代码块：不在中间打断（若不可避免则显式标注）

Integration：
- handler 输出很长时，send 被调用多次，且首片带 @mention（若有）

自动验证：
- `test:unit`、`test:integration`

#### Task 6：Codex runner（codex/runner.ts）

产物：
- 抽象出 `runCodex({ thread_id?, workspace, sandbox, prompt }) -> { thread_id, final_text }`
- 支持 `codex exec` 与 `codex exec resume`
- JSONL 解析：至少抓 `thread.started` 和最终 `agent_message`

UT：
- JSONL parser：乱序/噪声行能忽略，能提取 thread_id 和 final_text
- 超时处理：模拟子进程 hang

Integration：
- fake codex 可执行文件（fixture 输出 JSONL）：
  - 场景 A：新 thread（输出 thread.started）
  - 场景 B：resume（复用 thread_id）
- 断言 chat->thread 映射在 sqlite 中落盘

自动验证：
- `test:unit`、`test:integration`、`smoke:replay`

#### Task 7：会话映射与串行队列（codex/session.ts + queue）

产物：
- `chat_id -> thread_id/workspace/sandbox` 映射逻辑
- 同 chat 串行执行队列（不同 chat 并行）

UT：
- 同 chat 两条消息：第二条必须在第一条完成后才开始（用 fake runner 注入延迟验证）

Integration：
- replay 两条消息到同 chat：fake runner 被按顺序调用

自动验证：
- `test:unit`、`test:integration`

#### Task 8：Feishu 发送与回复（feishu/send.ts）

产物：
- 统一 `sendReply(inbound, chunks, mode)`：
  - 优先 reply 到原消息（使用 message_id）
  - 失败时 fallback 到 create（并记录错误）
- send API client 封装（便于 mock）

UT：
- reply 路由：reply_to_message_id 存在时调用 reply
- fallback：reply 失败时走 create（mock 抛错）

Integration：
- 全链路：replay -> policy pass -> codex stub -> render -> send stub 收到 N 个 chunk

自动验证：
- `test:integration`、`smoke:replay`

#### Task 9：WebSocket 监听与事件分发（feishu/ws.ts）

产物：
- 实际接入 `WSClient + EventDispatcher`
- 将事件交给“纯 handler”（方便测试）
- 重连机制与日志

UT：
- 重连 backoff 计算（纯函数）

Integration（不连真实飞书）：
- fake WS：直接调用 handler（或用 EventDispatcher 的本地触发接口）
- 断言：不会重复处理同 message_id（processed_messages 生效）

人工验收（需要真实飞书）：
- 真实群里 @ 机器人，能收到回复

#### Task 10：App 主入口与运行模式（app.ts）

产物：
- CLI 参数：
  - `--config <path>`
  - `--replay <fixture.json>`：离线回放模式（集成测试与 smoke 用）
  - `--dry-run`：不调用 codex，只回显解析后的 prompt（便于快速定位）
- health endpoint（可选）：`127.0.0.1` 本地

UT：
- 参数解析（最小）

Integration：
- `smoke:replay`：用 fixture + codex stub + send stub，退出码 0

自动验证：
- `smoke:replay` 固化为 CI 可跑

#### Task 11：Doctor 自检命令（减少人工介入成本）

目标：把“必须人工介入”的部分变成可被程序诊断、提示和引导的步骤，尽量做到你只需要按 doctor 输出的 checklist 操作。

产物：
- CLI 命令：`codex-feishu-bridge doctor --config <path>`
- 输出内容（按检查项逐条 PASS/FAIL/WARN）：
  - 本地环境：
    - `node` 版本、依赖安装是否完整
    - `codex` 是否可执行、`codex --version`、是否已登录（用一次只读 probe prompt 验证 `codex exec --json` 可运行）
  - 配置文件：
    - config 能否解析（TOML + schema）
    - workspace 路径是否存在、是否在白名单
    - sqlite 存储路径是否可写
  - Feishu 连通性（需要配置 app_id/app_secret）：
    - 尝试调用一个“低风险探测 API”获取 bot 信息（例如 bot info），验证凭据正确
    - 可选：拉取 app scopes 列表（若 API 可用），对比缺失的 scopes 并给出链接/建议
  - 策略提示：
    - 如果 `groupPolicy=allowlist` 但 `allow_from_group_chat_ids` 为空，提示如何获取 chat_id（建议：先开 `--dry-run` 运行一次真实 WS，日志会打印 chat_id）
    - 如果 `dmPolicy=allowlist/pairing` 但 `allow_from_user_open_ids` 为空，提示如何获取 open_id
  - Feishu 事件订阅检查（无法完全自动化）：
    - 输出“你需要在控制台勾选的事件列表”和“Socket 模式需要打开的位置”
    - 提供一个 `doctor --watch` 模式（可选）：启动 WS，等待 1 条真实消息事件来确认事件订阅已生效（这一步需要你手工发一条消息）

UT：
- doctor 里每个 check 做成纯函数：输入（配置/探测结果）-> 输出（PASS/FAIL + message）
- codex probe parser（基于 JSONL）复用 runner 的解析器

Integration（离线）：
- 用 stub 的 `codex` JSONL + stub Feishu client（mock 掉探测 API），断言 doctor 输出包含预期的 PASS/FAIL

人工介入：
- `doctor --watch` 需要你在飞书里发一条消息（用于验证事件订阅/机器人进群）

自动验证：
- `test:unit`、`test:integration`

### 8.5 Replay/Fixture 规范（关键：减少人工）

为让 Codex 最大化自助完成开发，建议从 Day 1 就建立 fixtures 目录：
- `fixtures/feishu/im.message.receive_v1.text.json`
- `fixtures/feishu/im.message.receive_v1.post.json`

以及 codex stub：
- `fixtures/codex/jsonl/new_thread.jsonl`
- `fixtures/codex/jsonl/resume.jsonl`

`--replay` 模式要求：
- 读取 fixture -> 走完整 handler -> 产出“发送请求记录”（写到 stdout 或临时文件）
- 集成测试只需断言“发送记录”和“sqlite 状态”即可，无需真实外部依赖

## 9. 进度记录（开发过程中持续更新）

规则：
- 每完成一个 Task（或拆分的子任务），在这里把状态改为 `DONE` 并补 1 行简短说明（日期 + PR/commit + 验证命令）。
- 任何需要你人工操作的地方，在对应 Task 的“人工介入”里明确写出。

状态定义：
- `TODO`：未开始
- `DOING`：进行中
- `DONE`：已完成并通过金线命令验证
- `BLOCKED`：被外部条件卡住（例如缺飞书权限）

| Task | 状态 | 说明 | 自动化验证 |
|------|------|------|------------|
| Task 0 仓库骨架与工具链 | DONE | 2026-02-14: `codex-feishu-bridge` 初始化完成（TS+eslint+vitest+smoke）。 | lint/typecheck/test:unit/test:integration/smoke:replay |
| Task 1 配置加载与校验 | DONE | 2026-02-14: `src/config.ts` + UT/IT 覆盖，支持 env 覆盖 `FEISHU_APP_ID/SECRET`。 | test:unit + test:integration |
| Task 2 sqlite 存储层 | DONE | 2026-02-14: 使用 `node:sqlite` 实现 `processed_messages/chat_sessions` + UT/IT。 | test:unit + test:integration |
| Task 3 入站事件解析 | DONE | 2026-02-14: 实现 text/post 解析、@mention strip + UT。 | test:unit + smoke:replay |
| Task 4 策略引擎 | DONE | 2026-02-14: 实现 DM/群 allowlist + requireMention 策略 + UT。 | test:unit + test:integration |
| Task 5 渲染与分片 | DONE | 2026-02-14: `feishu/render.ts` 实现 auto/raw/card + chunking，补 UT。 | test:unit + test:integration |
| Task 6 Codex runner | DOING | 已实现 JSONL 解析与真实 runner（未加入离线 stub fixture 驱动的 IT）。 | test:unit + test:integration + smoke:replay |
| Task 7 会话映射与队列 | TODO |  | test:unit + test:integration |
| Task 8 Feishu send/reply | TODO |  | test:integration + smoke:replay |
| Task 9 WS 监听与分发 | TODO |  | test:unit + test:integration (+人工E2E) |
| Task 10 App 主入口 | TODO |  | smoke:replay |
| Task 11 Doctor 自检 | TODO |  | test:unit + test:integration |
