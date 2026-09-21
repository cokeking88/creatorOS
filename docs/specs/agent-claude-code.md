# v0.3 Agent 内核替换为 Claude Code + 执行步骤实时流式展示

> 状态：R0 已评审（用户已确认全部关键决策）。本文档为 R1–R5 的唯一需求基线。
> 版本基线：CreatorOS v0.2（自研 AgentRuntime：JSON 工具循环 + provider 层 mock/anthropic/openai-compatible）→ v0.3。

## 背景

CreatorOS v0.2 的内置 agent 是自研的 `AgentRuntime`：主进程自己维护 JSON 工具循环（组请求 → 解析 tool_use → 执行内置浏览器工具 → 回填 tool_result → 再组请求），LLM 接入通过自研 provider 层（mock / anthropic / openai-compatible 三分支）。它带来三类问题：

1. **自研内核不可持续**。工具循环、流式解析、上下文管理、会话续接、中断语义全部手工维护，SDK 升级与协议演进都要追赶；Claude Code Agent SDK（`@anthropic-ai/claude-agent-sdk`）已把这套 harness（工具执行、上下文、权限、会话）完整封装。
2. **执行过程黑盒**。一次 agent 运行只有最终文本返回，用户看不到它调了哪些工具、点了哪些按钮，对「agent 替我在浏览器上操作」的信任与排障都是硬伤。
3. **聊天与 cron 两套语义**。cron 任务跑的是独立 workflow，与聊天面板行为不一致，工具与配置改动要双份维护。

已确认的决策（写死，不再讨论）：

1. **不自研**：弃用自研 AgentRuntime，agent 内核整体替换为 Claude Code Agent SDK（`@anthropic-ai/claude-agent-sdk` 0.3.278，`query()` spawn claude CLI 子进程）。
2. **步骤实时可见**：agent 执行步骤（工具调用开始/结果、文本输出、完成/出错）必须**动态流式**展示在 UI 上，不是跑完一次性回放。
3. **聊天与 cron 同机制**：实时聊天任务和 cron task 用同一个 `ClaudeAgentService`，步骤事件走同一条流（同一 `AgentStep` 事件通道）。
4. **公司网关接入**：模型接入走公司 fuyao 网关的 **Anthropic 协议入口**——`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`（`ANTHROPIC_API_KEY` 为备选），Settings 页可配 base URL / token / apiKey / model。
5. **旧 provider 层全量移除**：mock / anthropic / openai-compatible 三个 provider 分支及相关配置形态（`provider`/`anthropicKey`/`compatBaseUrl`/`compatModel`…）不再保留。
6. **cron 新增 `agent.run`**：`workflowType: 'agent.run'`，prompt 由用户在 Automation 页配置，由同一引擎执行。
7. **测试双层**：vitest 单测覆盖纯逻辑翻译器；playwright E2E 用 `CREATOROS_FAKE_CLAUDE=1` 让 `ClaudeAgentService` 吐确定性脚本步骤，全链路离线可跑（不依赖真实网关）。

## 用户故事

- 作为**内容创作者**，我希望在 Agent 面板发指令时能看到 agent 正在调用的每个浏览器工具（点哪、填哪、返回什么），以便判断它是否按我的意图操作、出问题时知道卡在哪一步。
- 作为**内容创作者**，我希望在 agent 跑偏时随时点「停止」中断执行，以便及时止损，不用等它把错误流程跑完。
- 作为**内容创作者**，我希望在同一个会话里继续对话（续聊），以便在上一轮结果上追加指令而不用重贴上下文。
- 作为**内容创作者**，我希望配置公司网关的 base URL / token / model 后立即生效（无需重启 app），并可一键测试连通性，以便在无外网 Anthropic 直连的环境下用上模型。
- 作为**自动化用户**，我希望创建 cron 任务选择 `agent.run` 并写 prompt，定时由与聊天同一套 Claude Code 引擎执行，以便无人值守跑周期性运营动作，且其执行步骤与聊天共用同一条事件流、可在日志/面板追溯。
- 作为**开发者/审计者**，我希望每次 agent 运行（无论聊天还是 cron 触发）都在 `agent_runs` 表留下完整审计记录（session_id / cost / duration / steps / 状态），以便排查线上问题与核算成本。

## 范围内 / 范围外

**范围内**：

- `ClaudeAgentService`：基于 SDK `query()` 的运行内核（env 注入网关配置、`CLAUDE_CONFIG_DIR` 隔离、内置浏览器工具经进程内 SDK MCP server 暴露）。
- `stepTranslator`：SDK 流消息 → UI `AgentStep` 的纯函数翻译（tool_start / tool_result / text / done / error 五类步骤）。
- IPC 步骤流：`agent:run` / `agent:stop` / `event:agent-step` / `event:agent-done`，同步四处（`shared/ipc.ts`、`preload.cts`、`registerIpc`、`global.d.ts`）。
- AgentPanel UI 重写：流式步骤行（工具调用可展开 input/结果、文本打字机、done/error 状态行、停止按钮、多轮续聊指示）。
- Settings 页改为引擎配置（baseUrl / authToken / apiKey / model + Test connection），保存即热生效，含 v0.2 `provider-config` 旧配置行的一次性迁移。
- `agent_runs` 表扩展（session_id / steps_json / cost_usd / duration_ms）与每次运行的审计写入。
- cron `workflowType: 'agent.run'`（Scheduler 分支 + Automation 页配置 UI）。
- 测试：`stepTranslator` vitest 单测；`CREATOROS_FAKE_CLAUDE=1` fake 模式 + agent/settings E2E。
- 移除：自研 AgentRuntime、provider 层三分支、`agent.chat` IPC、`CREATOROS_AGENT_PROVIDER`、`AGENT_CHAT`/`EVENT_AGENT_TOKEN` 旧通道、openai-compatible 相关 env/文档。

**范围外**：

- 不做 agent 任意 MCP 工具的动态注册 UI（浏览器工具集固定）。
- 不做步骤流的持久化回放页面（`agent_runs.steps_json` 仅落库供审计查询，不建历史回放 UI）。
- 不做网关侧的鉴权/计费（沿用公司 fuyao 网关既有能力，app 只做透传配置）。
- 不做多 agent / 子 agent 编排（SDK 单 query 会话级能力即可）。
- 不改变 Gateway HTTP API 的既有端点形态（cron 触发沿用 `POST /api/jobs/:id/run`）。
- 不做 Windows/Linux 打包链路验证（Mac 本机门禁为准）。

## 验收标准（可测试）

> 每条标准均标注可对应的测试层与用例锚点；实现与测试必须逐条对齐（R4 检查表直接引用编号）。

1. **聊天步骤流实时展示（四类步骤正确到达 renderer）**
   条件：`CREATOROS_FAKE_CLAUDE=1` 启动 app，Agent 面板发送一条 prompt。
   操作：观察 `event:agent-step` 事件序列。
   预期：renderer 依次收到 ≥4 步：`tool_start`（tool 名为 `mcp__creatoros-browser__browser_navigate`，带 inputText）→ `tool_result`（ok:true、带 detail）→ `text`（非 delta 全文）→ `done`（detail JSON 含 cost/duration）；每步 `seq` 单调递增、`runId` 一致；面板 UI 在每步到达时立即新增一行（流式，非结束后一次性渲染）。
   测试：E2E `agent.spec.ts`（fake 模式）收集 `onAgentStep` 序列断言类型与顺序；UI 行数随事件增长。

2. **文本 delta 打字机**
   条件：真实 SDK 连接（人工验证或 fake 之外的手测路径），`includePartialMessages` 开启。
   操作：发送会产出文本回答的 prompt。
   预期：`stream_event` 的 `text_delta` 翻译为 `{type:'text', isDelta:true}` 步骤，后续被同轮 assistant 全文 `text` 步骤覆盖为最终文本。
   测试：vitest `stepTranslator`——`stream_event.content_block_delta.text_delta` → `isDelta:true` 用例（离线断言翻译纯函数）。

3. **停止按钮中断**
   条件：agent 运行中（busy 状态，面板出现「停止」按钮）。
   操作：点击「停止」（或调用 `window.creatorOS.agent.stop(runId)`）。
   预期：`ClaudeAgentService.stop()` 调 `q.interrupt()` 并 abort，返回 `true`；`agent_runs` 该 run 状态落为 `failed`（error 非空）；UI busy 结束、不再收到该 run 的新步骤；对不存在的 runId 调 stop 返回 `false`。
   测试：E2E（fake 模式下对长运行脚本步骤中途 stop）+ vitest（stop 对未注册 runId 返回 false 的逻辑可注入断言）。

4. **多轮续聊（resume）**
   条件：一次 agent 运行成功结束，结果携带 `sessionId`。
   操作：在同一面板再发一条 prompt（`agent.run(prompt, sessionId)`）。
   预期：第二次运行经 SDK `resume` 传入该 session，新 run 的 `agent_runs.session_id` 与首轮一致（或 SDK 续接会话语义下可追溯），面板显示「会话已续接」状态；首轮上下文对续聊可见（fake 模式断言参数传递即可）。
   测试：E2E fake 模式两次 `agent.run` 传递 resume，断言 `agent_runs` 两行 session_id 关系；面板状态文案。

5. **Settings 引擎配置热生效**
   条件：app 运行中，Settings 页已有任意已保存配置。
   操作：修改 base URL / token / model 之一并 Save。
   预期：`settings:set` 后无需重启，下一次 `agent.run` 即使用新配置（`ClaudeAgentService` 每次运行时重新读取 `getAgentEngineConfig()`，无缓存挡板）；DB `settings` 表 `key='agent-engine'` 行更新为纯 JSON；重启 app 后配置仍在。
   测试：E2E `settings.spec.ts`——save 后改值 → 新 run 启动日志（或 fake 断言注入 env 的读取点）→ 重启同 userData 再 `settings.get()` 断言一致。

6. **v0.2 旧配置行迁移**
   条件：`settings` 表存在 v0.2 形态的 `provider-config` 行（含 `provider` 字段的 JSON）。
   操作：app 启动 / `settings:get`。
   预期：读到该行时不返回旧形态，回落到 env 推导的 `AgentEngineConfig`（`engineConfigFromEnv()`），不抛错、不返回 `provider` 字段。
   测试：vitest `settings.test.ts`——注入含 `provider` JSON 的行，断言 `get()` 返回 env 形态、无 `provider` 键。

7. **Test connection**
   条件：Settings 页已填引擎配置。
   操作：点击「Test connection」（先 save 再触发 `settings:test-provider`）。
   预期：fake 模式返回 `{ok:true, detail:'fake mode'}`；真实模式对网关发一条最短 prompt（30s 超时 abort），成功返回 `{ok:true, detail:'ok'}`，失败返回 `{ok:false, detail:<错误摘要>}`，UI 分别显示 ✓/✗。
   测试：E2E fake 模式断言 `{ok:true}`；真实连通性为人工验证项（门禁不依赖外网）。

8. **cron `agent.run` 与聊天共用引擎**
   条件：Automation 页创建 job：`workflowType:'agent.run'`，`payload.prompt` 非空。
   操作：触发该 job（`POST /api/jobs/:id/run` 或到点）。
   预期：Scheduler 分支调用**同一个** `ClaudeAgentService.streamRun`（`source:'cron:<jobName>'`），步骤走同一条 `AgentStep` 流（聊天面板订阅同一事件即可看到）；`agent_runs` 落行（input_json 含 source 与 prompt），`job_runs` 落行（output_json 含 text/steps/sessionId）；`payload.prompt` 为空时 job 失败并记 error。
   测试：E2E——fake 模式建 agent.run job → `POST /api/jobs/:id/run` → 断言 `agent_runs`/`job_runs` 两表落行且 status='success'；vitest/类型层断言 payload 校验路径（空 prompt 报错用例可注入 Scheduler 逻辑或并入 E2E）。

9. **`agent_runs` 审计记录**
   条件：任意一次 agent 运行结束（成功或失败）。
   操作：查询 `agent_runs`。
   预期：每 run 一行，字段齐全：`id`/`provider='claude-code'`/`status('running'→'success'|'failed')`/`input_json`(prompt+source)/`output_json`(text/stepCount/sessionId)/`session_id`/`cost_usd`/`duration_ms`/`started_at`/`finished_at`/`error`；中断与异常路径同样落 `failed` 行，不留永久 `running`。
   测试：E2E fake 模式跑一次成功 run + 一次失败/中断 run，直连 sqlite（`new DatabaseSync(<userData>/data/creatoros.sqlite)` 只读）断言字段与终态。

10. **E2E fake 模式全离线**
    条件：CI/门禁环境无外网、无公司网关。
    操作：`CREATOROS_FAKE_CLAUDE=1`（随 `launchApp()` 注入）跑 `npm run test:e2e`。
    预期：agent 类 E2E 全部通过——fake 路径不 spawn SDK 子进程，直接回放确定性脚本消息序列（tool_use → tool_result → assistant text → result），经同一 `stepTranslator` 翻译成步骤流；全套 E2E 无任何对外网络请求（fixture 页走 `127.0.0.1:17992`）。
    测试：即本条所述 E2E 本身（`playwright.config` + helpers 的 env 注入为前提，验收即「离线环境 gate 绿」）。

11. **旧 provider 代码移除干净**
    条件：v0.3 合入后。
    操作：全仓检索旧符号与旧通道。
    预期：`AgentRuntime`、`mock`/`anthropic`/`openai-compatible` provider 分支、`agent:chat`/`AGENT_CHAT`、`event:agent-token`/`EVENT_AGENT_TOKEN`、`CREATOROS_AGENT_PROVIDER`、`CREATOROS_AGENT_PROVIDER=mock` env、settings `provider`/`anthropicKey`/`compatBaseUrl`/`compatModel` 形态在 src/e2e/tests/scripts 与 `.env.example`、docs 中不再出现（唯一豁免：`settings.ts` 迁移分支中对旧 `provider-config` 行的兼容读取注释/代码，及 spec/CHANGELOG 的历史记载）；`typecheck` 与 `grep` 均零命中。
    测试：E2E 重写后的 `agent.spec.ts`/`settings.spec.ts` 不再引用 `agent.chat`/`provider`（编译期保证）；残留检索作为 R3 自检清单项（`grep -r "CREATOROS_AGENT_PROVIDER\|compatBaseUrl\|AGENT_CHAT" src e2e tests scripts` 零输出）。

12. **步骤流 IPC 四处同步**
    条件：新增/改动任何 agent IPC 通道。
    操作：检查 `shared/ipc.ts` 常量、`preload.cts` 白名单方法、`registerIpc` handler、`renderer/global.d.ts` 类型。
    预期：`AGENT_RUN`/`AGENT_STOP`/`EVENT_AGENT_STEP`/`EVENT_AGENT_DONE` 四处一致；preload 不暴露 `ipcRenderer` 本体；renderer 调用有完整类型。
    测试：typecheck（`tsconfig.e2e`/renderer）+ E2E 通过 `window.creatorOS.agent.*` 真实调用即隐式验证；R3 自检清单核对四处清单。

13. **agent 日志可追溯**
    条件：任意 agent 运行。
    操作：Logs 页过滤 `module='agent'`。
    预期：每 run 有 `Agent run started`（meta 含 runId/source/resume）与 `Agent run finished`（或 failed/interrupted）日志行，meta 带 runId，可供排障串联 `agent_runs`。
    测试：E2E——fake run 后 `window.creatorOS.logs.list({module:'agent'})` 断言 started/finished 行与 runId。

## 依赖与风险

**依赖**：

- `@anthropic-ai/claude-agent-sdk` **0.3.278**（package.json 已锁定版本线）：`query()` / `createSdkMcpServer` / `SDKMessage` 流形态（assistant/user/stream_event/result 消息）是 `stepTranslator` 的契约面，SDK 升级可能变更流消息结构，需在 R2 风险清单中锁定并加升级回归。
- 公司 fuyao 网关的 Anthropic 协议入口可用且鉴权 token 发放流程稳定（不可用则退回官方 `api.anthropic.com`，`baseUrl` 留空即默认）。
- claude CLI 运行时：SDK 通过子进程方式 spawn，依赖本机可用的 CLI 版本与 `CLAUDE_CONFIG_DIR` 可写（已指向 `userData/claude-agent`，不污染 `~/.claude`）。
- Drizzle 迁移链：`agent_runs` 新列（session_id/steps_json/cost_usd/duration_ms）需 `db/index.ts` 幂等 CREATE 兼容已有 v0.2 库。

**风险**：

| 风险 | 影响 | 缓解 |
|---|---|---|
| SDK 流消息结构随版本变化（0.3.278 之后的 breaking change） | 步骤翻译错漏、UI 静默丢步 | `stepTranslator` 纯函数 + vitest 契约用例先行；升级时跑翻译套件回归；未识别消息类型安全返回 `[]`（不崩） |
| 子进程模式带来的启动延迟与资源占用 | 每轮 run 有固定 spawn 开销，cron 高频任务放大 | run 级复用评估放范围外；当前以「每次 run 一个 query」为基线，性能不达标再评估 SDK 进程内 transport |
| fake 模式与真实 SDK 行为漂移 | E2E 绿但线上行为不符 | fake 消息序列直接复用 `stepTranslator`（同一翻译层），消息 shape 以 SDK 0.3.278 实测为准固定在用例里 |
| 停止语义竞态（interrupt 后仍收到尾部步骤/事件） | UI busy 状态不一致、agent_runs 终态错误 | run 结束以 `result` 消息/异常为准统一收口；`stop()` 后 flush 事件并强制落终态；E2E 中断用例覆盖 |
| 旧配置迁移兼容 | v0.2 老库升级后 settings 读出异常形态 | 迁移分支只识别 `provider` 键即回落 env，vitest 注入旧行用例（AC6） |
| token 明文存 SQLite | 安全面暴露与既有 SECURITY 文档口径 | 沿用 v0.2 安全基线（本地单机、DB 不出网关），后续 Keychain 加密另立 spec，不在本 spec 内扩权 |
| `bypassPermissions` 的权限面 | agent 可不经确认执行浏览器动作 | 系统 prompt 已约束高危动作先确认；`allowedTools` 白名单仅 `mcp__creatoros-browser__*`，无文件/bash 工具面；后续如需收紧再立 spec |
