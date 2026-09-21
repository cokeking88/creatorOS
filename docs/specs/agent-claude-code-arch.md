# v0.3 技术方案（R2 架构设计）— Claude Code Agent 内核 + 步骤流式展示

> 阶段：R2 架构设计产物（对应 `docs/WORKFLOW_CN.md` §3）。
> 需求基线：`docs/specs/agent-claude-code.md`（R0，AC1–AC13）。
> UI 基线：`docs/specs/agent-claude-code-ui.md`（R1，§8 缺口清单 G1–G12 为本方案的主要输入）。
> 事实来源：`node_modules/@anthropic-ai/claude-agent-sdk@0.3.278/sdk.d.ts`（SDK 类型契约，比外部文档权威）；实现现状为 `src/main/agent/*`、`src/main/ipc/registerIpc.ts`、`src/main/scheduler/Scheduler.ts`、`src/main/gateway/Gateway.ts`、`src/renderer/components/AgentPanel.tsx`。
> 本文档只定义方案，不改代码；R3 按此实现，R4 按此补测试。

---

## 0. 方案总览

一句话：**把「步骤分发」从 IPC 层下沉为一个 main 进程内的进程内事件总线（StepBus），把「run 终态」收敛到 `ClaudeAgentService` 内唯一的 `finalize()` 收口，把「面板渲染」改为完全由事件流驱动的单一数据模型（RunItem）**。三个收敛合起来同时解掉 R1 的 G1/G2/G3/G4/G5/G6/G11，其余缺口（G7/G8/G9/G10/G12）为局部修补。

### 0.1 目标数据流（改后）

```
                       main process
  ┌────────────────────────────────────────────────────────────┐
  │ ClaudeAgentService.streamRun(prompt, {runId, source, ...}) │
  │   ├─ SDK query() for-await ──► stepTranslator（纯函数）      │
  │   ├─ AgentStep(+source/msgUuid/durationMs) ──► StepBus.publish('step')  │
  │   └─ finalize()（唯一收口）                                  │
  │        ├─ 合成缺失的终止步骤（error / interrupted）          │
  │        ├─ agent_runs 终态落库（含 steps_json/cost/duration）  │
  │        └─ StepBus.publish('done', AgentRunResult)            │
  │                                                            │
  │ StepBus（进程内，不依赖 renderer 存活）                       │
  │   ├─ 订阅者 A：main.ts 转发器 → webContents.send（win 存活检查）│
  │   │     → EVENT_AGENT_STEP / EVENT_AGENT_DONE               │
  │   └─ 订阅者 B：agent child logger（debug 级步骤打点）          │
  └────────────────────────────────────────────────────────────┘
        ▲ chat: registerIpc AGENT_RUN（runId 即返）  ▲ cron: Scheduler agent.run
        │                                          │
  ┌────────────┐                            ┌──────────────┐
  │ AgentPanel │  （RunItem 单一数据模型，    │  Scheduler    │  job_runs 落行
  └────────────┘   done 只改终态不追加）      └──────────────┘
```

关键不变量：

1. **每个 run 的所有状态转换只来自 StepBus**：`agent:run` invoke 变为「启动即返回 runId」，完成态只经 `event:agent-done` 下发（G2/G11 的根因消除）。
2. **`finalize()` 每个 run 恰好执行一次**（幂等守卫），无论正常 result、SDK 异常、还是中断 abort——保证 `pushDone` 一定发生、`agent_runs` 一定有终态（G6/AC9）。
3. **StepBus 与 renderer 生命周期解耦**：win 销毁时事件丢弃（审计已落 `agent_runs`/日志），win 重建后无需重新订阅（订阅者持 `mainWindow` 引用而非闭包捕获旧 win）（G1）。
4. **chat 与 cron 走同一条流**：Scheduler 不再自带 `onStep` 广播逻辑，`source` 字段随步骤下发，banner 由 renderer 按 `source`/`runId` 派生（G1/AC8）。

### 0.2 SDK 契约事实核查（0.3.278 sdk.d.ts，方案据此设计）

这些是 G5/G6 设计的依据，升级 SDK 版本时须重新核对：

| 事实 | 出处（sdk.d.ts） | 对方案的影响 |
|---|---|---|
| **result 消息没有 `interrupted` 子类型**。`SDKResultError.subtype` 联合仅为 `'error_during_execution' \| 'error_max_turns' \| 'error_max_budget_usd' \| 'error_max_structured_output_retries'`；`SDKResultMessage = SDKResultSuccess \| SDKResultError` | `SDKResultError` 定义 | 中断的终止态**不能依赖**「interrupt 后 for-await 正常结束并收到 `subtype:'interrupted'` 的 result」——必须由 catch 路径合成 |
| `Query.interrupt()` 是 control request（`subtype:'interrupt'`），返回 interrupt receipt；receipt 文档注明「clean interrupt 时 receipt 写在**被中断 turn 的 result** 之前」——即 interrupt 后**可能**仍有一条 result 消息，但其 subtype 无独立文档承诺 | `Query.interrupt()` / `SDKControlInterruptResponse` | 中断走「interrupt → 立即 abort」双段式；若尾部 result 恰好先到，正常路径 finalize 先赢（幂等守卫兜住竞态） |
| abort 路径：`Options.abortController` 触发后 ProcessTransport 置 `exitError = AbortError`；`readMessages()` 在 stdout 流结束后 **throw AbortError**——**即使 result 消息已经 yield 过**，生成器仍可能在 `waitForExit()` 处抛出 | `Options.abortController` 注释 + ProcessTransport 实测（sdk.mjs） | for-await 的 catch 一定会被中断触发；且「先 result 后 throw」竞态真实存在 → `finalize()` 必须幂等（首个 finalize 生效，后续为 no-op） |
| `SDKResultSuccess.is_error: boolean`：「subtype success 也可带 is_error:true，result 字段是错误文本（turn 结束于 API error）」 | `SDKResultSuccess` | 当前 translator 把 subtype=success 一律译成绿色 done 行——**错**。需按 `is_error` 分流为 error 步骤 |
| `SDKAssistantMessage.aborted?: true`：assistant 消息被 interrupt/abort 截断时标记 | `SDKAssistantMessage.aborted` | 可选增强：截断的 assistant 文本在 UI 上不计入最终回复（v0.3 不依赖） |
| assistant / stream_event 消息都带顶层 `uuid: UUID` | `SDKAssistantMessage` / `SDKPartialAssistantMessage` | delta 聚合按 msgUuid 分组（G3），防止多条 assistant 文本互相覆盖丢失 |
| `Options.resume?: string`：session 续接 | `Options.resume` | AC4 续聊；fake 模式需透传 resume 才能被 E2E 断言 |
| `createSdkMcpServer` 进程内 MCP；工具调用超时默认「effectively unbounded」 | `createSdkMcpServer` 注释 | 浏览器工具耗时上限依赖 `MAX_TOOL_RESULT_CHARS` 截断与 BrowserKernel 自身超时，v0.3 不额外配 MCP timeout（范围外） |

---

## 1. WORKFLOW §3 检查清单逐项回答

### 1.1 分层（每处改动落在哪层）

| # | 文件 | 层 | 改动 |
|---|---|---|---|
| 1 | `src/shared/types.ts` | shared | `AgentStep` 增 `source?/msgUuid?/durationMs?`；`AgentRunResult` 增 `error?/interrupted?/source?`（见 §2 类型定义） |
| 2 | `src/shared/ipc.ts` | shared | **删除** legacy `AGENT_CHAT`、`EVENT_AGENT_TOKEN` 两个常量（AC11 残留，grep 命中项）；`AGENT_RUN/AGENT_STOP/EVENT_AGENT_STEP/EVENT_AGENT_DONE` 保留不变 |
| 3 | `src/main/agent/stepBus.ts` | main·agent | **新增**：进程内事件总线（§2.1） |
| 4 | `src/main/agent/runRegistry.ts` | main·agent | **新增**：活动 run 注册表（stop 语义抽纯类，可 vitest；从 `ClaudeAgentService` 抽出不带 Electron import 的部分，AC3「stop 对未注册 runId 返回 false」进单测） |
| 5 | `src/main/agent/fakeScript.ts` | main·agent | **新增**：fake 模式确定性消息脚本纯函数（从 `runFake` 内联数组抽出；带 resume 透传与延时钩子，§4.7） |
| 6 | `src/main/agent/claudeAgent.ts` | main·agent | `streamRun` 契约改造（不 reject、finalize 收口、bus 发布、steps_json 落库、stop 双段式）；`buildOptions` 不变；`allMsgs` 全量数组改为「只留 sessionId + 最后一条 result」（内存有界，工具结果单条可达 18KB） |
| 7 | `src/main/agent/stepTranslator.ts` | main·agent | 纯函数增量：`durationMs`（tool_result 配对耗时）、`msgUuid` 透传（text 步骤）、`is_error:true` 的 success result → error 步骤；`newTranslateState` 接受可注入 `now()` |
| 8 | `src/main/agent/browserTools.ts` | main·agent | 不改语义；工具名/description/schema 抽到共享定义（§1.5） |
| 9 | `src/main/ipc/registerIpc.ts` | main·IPC | `AGENT_RUN` 改为「生成 runId → fire streamRun → 立即返回 `{runId}`」；删除本文件内 `pushStep/pushDone` 直发与 `'unknown'` catch 兜底（终态只来自 bus） |
| 10 | `src/main/main.ts` | main | 创建 bus 并注入 `initClaudeAgent`；`bus.subscribe(forwarder)` 一次性订阅，forwarder 每次取当前 `mainWindow` 并做 `isDestroyed()` 检查 |
| 11 | `src/main/scheduler/Scheduler.ts` | main·scheduler | `agent.run` 分支：去掉 `onStep` 日志广播（bus 已分发），`runId` 复用 job run id 不变；**检查 `result.ok`，false 时 throw**（job_runs 落 failed） |
| 12 | `src/main/services/settings.ts` | main·services | 不改（迁移语义已在位，§1.3 复核） |
| 13 | `src/main/db/schema.ts` / `src/main/db/index.ts` | main·db | 4 新列已落地（§1.3 复核 + 补 `db:generate` 记录） |
| 14 | `src/main/gateway/Gateway.ts` | main·gateway | **无新端点**；`POST /api/jobs` 已存在且已过全局 Bearer 钩子（§1.4） |
| 15 | `src/preload/preload.cts` | preload | `agent.run` 返回类型换 `Promise<{runId:string}>`；白名单方法集不变，仍不暴露 `ipcRenderer` |
| 16 | `src/renderer/global.d.ts` | renderer | `agent.run:(prompt, resume?)=>Promise<{runId:string}>`；其余类型随 shared 更新 |
| 17 | `src/renderer/components/AgentPanel.tsx` | renderer | Item 模型重构为 `{user} \| {RunItem}`（§2.4）；渲染/终止/banner/stop 全部按新模型重写（G2/G3/G4/G5/G11） |
| 18 | `src/renderer/styles/app.css` | renderer | `.agent` 行模板 `55px 1fr auto` → `55px auto 1fr auto`（G7）；新增 `.step-group.done .step-icon.spin{animation:none}`（G8）；**不新增任何 hex** |
| 19 | `src/renderer/pages/AutomationPage.tsx` | renderer | G12：agent.run 空 prompt 前端必填校验 + Jobs 列表 prompt 首行摘要 |
| 20 | `e2e/helpers.ts` / `e2e/debug-flow.mts` | e2e | G10：`CREATOROS_AGENT_PROVIDER='mock'` → `CREATOROS_FAKE_CLAUDE='1'`；debug-flow.mts 同步或删除 |
| 21 | `e2e/agent.spec.ts` 等 | e2e | 按 §1.7 / §5 重写 |

preload 不再新增通道；preload 的 IPC 字面量与 `shared/ipc.ts` 的同步沿用现状（两处同改），R3 自检清单核对。

### 1.2 IPC：四处同步核对（现状 → 变更）

**现状核对**（`AGENT_RUN` / `AGENT_STOP` / `EVENT_AGENT_STEP` / `EVENT_AGENT_DONE` 四通道）：

| 处 | 现状 | 结论 |
|---|---|---|
| `shared/ipc.ts` 常量 | 四通道齐全；**但 legacy `AGENT_CHAT:'agent:chat'` 与 `EVENT_AGENT_TOKEN:'event:agent-token'` 仍在**（AC11 要求零命中） | 删两个 legacy 常量 |
| `preload.cts` 白名单 | `agent.run/agent.stop` + `onAgentStep/onAgentDone` 方法存在，通道字面量与 shared 一致；无 legacy 暴露 | 改 `agent.run` 返回类型 |
| `registerIpc` handler | `AGENT_RUN/AGENT_STOP` handler 存在；step/done 经 `pushStep/pushDone` 对 `win` 直发 | 直发逻辑移除，改 bus 订阅 |
| `global.d.ts` 类型 | `agent/agent:{run,stop}/onAgentStep/onAgentDone` 齐全 | 改 `agent.run` 返回类型 |

**变更后的契约**（通道名不变，只变负载语义）：

| 通道 | 方向 | 变更后契约 |
|---|---|---|
| `agent:run` | invoke | `(prompt: string, resumeSessionId?: string) => Promise<{ runId: string }>`——**立即返回**；run 的全部后续状态经事件流 |
| `agent:stop` | invoke | `(runId: string) => Promise<boolean>`——不变 |
| `event:agent-step` | main→renderer | `AgentStep`（增 `source/msgUuid/durationMs`）；chat 与 cron 同通道 |
| `event:agent-done` | main→renderer | `AgentRunResult`（增 `error/interrupted/source`）；**chat 与 cron 的 done 都经此下发**（cron 的 done 供 banner 清除；runId 保证匹配） |

为什么把 `agent:run` 改成即返 runId（而不保留「Promise 在 run 结束时 resolve」）：当前「invoke resolve + done 事件」双通道是 G2 三重渲染与 G11 stop 反查 runId 的共同根因；stop 在 run 结束前拿不到 runId，只能从 items 倒查。即返 runId 后：`send()` 立刻持有 `activeRunId`（G11 消解），busy 的解除只由 done 事件驱动（G2 消解），chat 与 cron 的完成语义对称（cron 本来就没有 invoke）。代价是 `global.d.ts`/`preload.cts`/`registerIpc` 三处类型同步——属本就该做的四处同步之一。

### 1.3 DB：`agent_runs` 增列迁移 + settings key 迁移

**agent_runs 增列（session_id / steps_json / cost_usd / duration_ms）**——方案沿用已落地的三层组合，R3 复核即可：

1. `src/main/db/schema.ts`：Drizzle 类型定义（已在：`sessionId/stepsJson/costUsd/durationMs`）。
2. `src/main/db/index.ts`：幂等引导——`CREATE TABLE IF NOT EXISTS`（新库直接含列）+ 对老库逐列 `pragma_table_info('agent_runs')` 查存在性、缺则 `ALTER TABLE ADD COLUMN`（v0.2 老库升级路径，不依赖迁移命令）。
3. `npm run db:generate`：生成并提交 drizzle 迁移记录，保持 `drizzle/` 与 schema 同步（DATABASE.md 的既定流程）。

不做 DROP/回滚（SQLite ALTER 复杂、单机工具无多机升级面，与 DATABASE.md 口径一致）。**R2 新增的落库要求**：`steps_json` 目前只有列没有写入——`finalize()` 负责写入，策略（防大 run 撑爆行）：

- 只存**非 delta** 步骤（delta 与全文冗余）；每步存 `{seq,type,tool,ok,durationMs,text?,inputText?,detail?}`；
- 单步 `text/inputText/detail` 已在 translator 截断（2000/400 字符）；
- 序列化后 > 256KB 时丢弃中间段（保留前 100 + 后 100 步，并置 `{truncated:true,dropped:N}` 标记）。

**settings 表 key 迁移（'provider' → 'agent-engine'）**——读路径惰性迁移，无写路径迁移：

| 项 | 方案 |
|---|---|
| 新写 | 永远写 `key='agent-engine'`，值为 `AgentEngineConfig` 纯 JSON（`SettingsStore.set`，已在位） |
| 旧读 | `SettingsStore.get()` 解析 JSON 后若含 `provider` 键（v0.2 形态）→ **不返回旧形态，回落 `engineConfigFromEnv()`**；JSON 解析失败同样回落（已在位，AC6 测试锚点） |
| 旧行处置 | **不删除、不改写** `provider-config`/含 provider 的旧行——避免破坏性迁移；旧 key 的行对 v0.3 代码不可见（读取只查 `agent-engine`），无害残留 |
| 判定键 | 以「parsed JSON 是否含 `provider` 键」为准（AC6 测试即注入 `{"provider":"anthropic"}`），不依赖旧 key 名——两种 v0.2 存放形态都覆盖 |

### 1.4 Gateway：`POST /api/jobs` 鉴权

**不新增端点**（R0 范围外承诺「不改变 Gateway 既有端点形态」）。核对结论：

- `POST /api/jobs` 已存在（`Gateway.ts` `scheduler.createJob`），且 **已被全局 `onRequest` 钩子覆盖**：除 `/health` 外一律校验 `Authorization: Bearer ${CREATOROS_GATEWAY_TOKEN}`，缺失/错误 401——满足 WORKFLOW「默认 Bearer token，`/health` 除外」的默认策略，无需改动。
- `POST /api/jobs/:id/run` 同理（cron 触发沿用，不变）。
- R2 补一条**输入校验**（在既有 handler 内，不改端点形态）：`name: string` 非空、`cron` 为 string（`cron.validate` 在 Scheduler.reload 已兜底）、`workflowType ∈ {'browser.navigate','demo','agent.run'}` 白名单、`agent.run` 时 `payload.prompt` 非空（后端兜底，与 G12 前端校验双保险；空 prompt 仍保留运行期报错路径作为最后防线）。
- Feishu webhook 不在本 feature 范围。

### 1.5 Agent/MCP：进程内 15 工具与外部桥的关系（同语义、双路径）

现状是**同一套浏览器工具语义、两条传输路径**，这是设计而非巧合：

| 路径 | 实现 | 传输 | 消费者 |
|---|---|---|---|
| 进程内 | `src/main/agent/browserTools.ts`：`createSdkMcpServer({name:'creatoros-browser', tools: createBrowserTools(kernel)})`，`tool()`+zod 定义，直调 `BrowserKernel` | SDK 进程内 MCP（无子进程、无 HTTP hop） | 内置 agent（chat + cron） |
| 外部桥 | `scripts/mcp-stdio.ts`：MCP v2 stdio server，同名 15 工具全部经 Gateway HTTP（Bearer token）转 `BrowserKernel` | stdio → localhost gateway | 任意外部 Claude/MCP host |

**双路径约束（WORKFLOW「新工具须同时更新两处」的架构化解法）**：工具名、description、zod inputSchema 抽到共享模块 `src/main/agent/toolDefs.ts`——

```ts
export type BrowserToolDef<S extends z.ZodRawShape> = {
  name: string;                 // 'browser_navigate' …（15 个，两路径共用）
  description: string;
  inputSchema: S;
  annotations?: ToolAnnotations;
};
export const BROWSER_TOOL_DEFS: BrowserToolDef[];   // 唯一事实来源
```

`browserTools.ts`（SDK `tool()` 包装，handler 直调 kernel）与 `scripts/mcp-stdio.ts`（`registerTool` 包装，handler 打 gateway HTTP）各自只写 **transport + handler**，名字/描述/ schema 从 `BROWSER_TOOL_DEFS` 读——新增/改工具只改一处，两路径不可能漂移。差异显式豁免：外部桥独有的 `job_run` 工具留在 mcp-stdio 本地（内置 agent 的工具面按 R0 冻结为浏览器 15 个，`allowedTools: ['mcp__creatoros-browser__*']` 不变）。

`CLAUDE_CONFIG_DIR` 隔离、`permissionMode:'bypassPermissions'` + `allowedTools` 白名单（无文件/bash 面）维持现状，安全口径沿用 SECURITY.md 第 6/8 条。

### 1.6 日志：agent 模块 child logger 打点方案（runId 贯穿）

`logger.child('agent')` 已在；固定打点表（**message 文案是 E2E 断言锚点，R3 不得改动**；meta 必含 runId）：

| 时机 | 级别 | message | meta |
|---|---|---|---|
| run 启动 | info | `Agent run started` | `{runId, source, resume:boolean, baseUrl?, model?}`（**绝不打 token/apiKey**；baseUrl/model 进 meta 是 AC5「热生效」的离线断言点——fake 模式下改配置再跑，日志 meta 变化即证新配置被读取） |
| 每步骤 | debug | `Agent step` | `{runId, seq, type, tool?}`（从 info 降级：ring 容量 2000，逐步 info 会把其他模块日志挤掉；AC13 只需首尾两行） |
| run 完成 | info | `Agent run finished` | `{runId, ok, steps, cost, sessionId}` |
| run 失败 | error | `Agent run failed` | `{runId, error}` |
| run 中断 | info | `Agent run interrupted` | `{runId}`（`stop()` 触发时打，见 §4.5） |

变更点：Scheduler 里的逐步 `this.log.info('Agent step')` **删除**（bus 分发后由 service 统一 debug 打点，Scheduler 不再重复）；中断补齐 finished/failed 之一由 `finalize()` 保证。

### 1.7 测试归层（vitest vs e2e）

| 层 | 用例 | 锚定的 AC |
|---|---|---|
| **vitest**（纯逻辑，无 Electron） | `stepTranslator`：现有 8 例全保留 + 新增——① `is_error:true` 的 success result → error 步骤；② tool_result 带 `durationMs`（注入 `now()` 断言差值）；③ text 步骤带 `msgUuid` 透传；④ delta 与全文同 uuid 分组互不干扰；⑤ 未识别消息 → `[]`（升级回归锚） | AC2、AC12（翻译层） |
| | `runRegistry`（新模块，无 Electron import）：stop 未知 runId → false；stop 已知 → interrupt+abort 各调用一次；重复 stop → false | AC3 |
| | `SettingsStore`：现有 4 例保留（roundtrip/upsert/v0.2 迁移/env 回落） | AC5、AC6 |
| | `fakeScript`（新模块）：fake 消息序列经 translator 产出 ≥4 步且类型顺序正确；resume 透传（脚本 echo resumeSessionId） | AC1、AC4 的离线面 |
| **playwright E2E**（真实 app + fake 模式，全离线） | `agent.spec.ts` 重写：步骤流序列/seq 单调/UI 行数随事件增长；stop 中断（`CREATOROS_FAKE_STEP_DELAY_MS` 中途停）；续聊 resume（agent_runs 两行 session_id 关系 + 面板文案）；`agent_runs` 成功+中断两行直读 sqlite 断言终态；`logs.list({module:'agent'})` 断言 started/finished 的 runId | AC1、AC3、AC4、AC9、AC10、AC13 |
| | `settings.spec.ts` 重写：save 热生效（run 后日志/step meta 佐证）+ 重启同 userData 持久 + Test connection fake `{ok:true,detail:'fake mode'}` | AC5、AC7 |
| | cron 用例（并入 agent.spec 或独立 automation.spec）：建 agent.run job → gateway `POST /api/jobs/:id/run` → 断言 `agent_runs`（source=cron:）/`job_runs`（success、output_json 含 text/steps/sessionId）双表落行；banner 出现并按 runId 清除；空 prompt job → job_runs failed | AC8 |
| | 残留检索（R3 自检，非用例）：`grep -r "CREATOROS_AGENT_PROVIDER\|compatBaseUrl\|AGENT_CHAT\|EVENT_AGENT_TOKEN" src e2e tests scripts` 零输出 | AC11 |

归层规则执行 WORKFLOW §5：`ClaudeAgentService` 因 `import { app } from 'electron'` 不进 vitest（其逻辑尽量抽进 stepTranslator/runRegistry/fakeScript 三个纯模块）；Electron 语义（IPC/落库/生命周期）全走 E2E。新能力（cron agent.run、settings 热生效）各配 E2E——双层都有的判据：纯函数逻辑多则 vitest，跨进程链路则 E2E，本 feature 两者兼备。

---

## 2. 关键接口定义（R3 实现契约）

### 2.1 StepBus（新文件 `src/main/agent/stepBus.ts`）

```ts
import type { AgentStep, AgentRunResult } from '../../shared/types.js';

/** Agent 运行事件的进程内分发。chat 与 cron 共用；与 renderer 生命周期解耦。 */
export type AgentBusEvent =
  | { kind: 'step'; step: AgentStep }
  | { kind: 'done'; result: AgentRunResult };

export type StepBusHandler = (event: AgentBusEvent) => void;

export interface StepBus {
  /** 同步 fan-out 给当前全部订阅者；订阅者抛错被吞掉（打点），不影响其他订阅者。 */
  publish(event: AgentBusEvent): void;
  /** 返回取消订阅函数。 */
  subscribe(handler: StepBusHandler): () => void;
  /** 当前订阅者数（测试用）。 */
  readonly size: number;
}

export function createStepBus(): StepBus;
```

约定：

- bus 是 **push-only、无缓冲**——win 销毁期间的事件即丢（审计在 `agent_runs`/日志，renderer 是临时视图）；不做回放队列（范围外）。
- service 持有 bus（默认模块级单例，构造器可注入替换）；`streamRun` 对每条翻译出的 step 先 enrich（补 `source`）再 `publish({kind:'step'})`。
- `main.ts` 在 `createWindow` 前订阅一次：

```ts
const agent = initClaudeAgent(kernel, { bus });
agent.bus.subscribe((ev) => {
  const w = mainWindow;                       // 每次取当前引用，win 重建后无需重订阅
  if (!w || w.isDestroyed()) return;           // 事件丢弃，不抛
  if (ev.kind === 'step') w.webContents.send(IPC.EVENT_AGENT_STEP, ev.step);
  else w.webContents.send(IPC.EVENT_AGENT_DONE, ev.result);
});
```

### 2.2 streamRun 契约（`ClaudeAgentService`）

```ts
export type StreamRunOptions = {
  /** 调用方指定（registerIpc/Scheduler 生成）；缺省时 service 内部 nanoid()。 */
  runId?: string;
  /** 'chat' | 'cron:<jobName>' —— 随步骤下发，renderer banner 依据。 */
  source?: string;
  /** 续聊：上一轮 result.sessionId。 */
  resumeSessionId?: string | null;
  /** 直连消费者（测试/诊断）；无论是否提供，bus 都会收到全量事件。 */
  onStep?: (step: AgentStep) => void;
};

/**
 * 单次 agent turn。
 * 契约：**run 级失败（SDK 异常/中断/子进程崩溃）不 reject**，一律 resolve 出
 * ok:false 的 AgentRunResult —— 保证 finalize 单收口可依赖、Scheduler 可据 ok 分流。
 */
async streamRun(prompt: string, opts: StreamRunOptions): Promise<AgentRunResult>;

export type AgentRunResult = {
  runId: string;
  sessionId: string | null;
  ok: boolean;
  text: string;
  stepCount: number;
  costUsd?: number | null;
  durationMs?: number | null;
  error?: string | null;      // 新增：失败/中断原因（agent_runs.error 同源）
  interrupted?: boolean;      // 新增：用户 stop 触发（UI 显示「已中断」而非泛化出错）
  source?: string;            // 新增：'chat' | 'cron:<jobName>'
};

/** 中断活动 run。未注册 runId 返回 false。双段式：q.interrupt() → abort.abort()。 */
stop(runId: string): boolean;   // 委托 RunRegistry，见 §2.3
```

`streamRun` 内部骨架（伪码，finalize 是 G6 的解）：

```ts
const finalized = { done: false };
const finalize = (res: AgentRunResult) => {
  if (finalized.done) return;        // 幂等：result 已收后又抛 AbortError 的竞态在此吸收
  finalized.done = true;
  if (!terminalStepEmitted) {         // 终止步骤缺失则合成（中断/异常路径 G6）
    const step = res.interrupted
      ? makeStep('error', { detail: JSON.stringify({ subtype: 'interrupted', error: res.error ?? null }) })
      : res.ok ? undefined /* done 步骤已由 translator 发出 */ : makeStep('error', { detail: JSON.stringify({ subtype: 'error', error: res.error }) });
    if (step) { opts.onStep?.(step); this.bus.publish({ kind: 'step', step }); }
  }
  writeAgentRunsTerminal(runId, res, compactSteps(stepsSoFar));   // status/cost/duration/steps_json/error
  this.log.info(res.ok ? 'Agent run finished' : 'Agent run failed', { runId, ... });
  this.bus.publish({ kind: 'done', result: res });
};

try {
  for await (const msg of q) { /* translate → enrich(source) → publish step；记录 sessionId/result 快照（不再全量 allMsgs）*/ }
  finalize(normalResult(...));       // ① 正常路径（result 消息已到）
} catch (e) {
  finalize(abortedOrErrorResult(e)); // ② abort（AbortError）/异常路径 —— 一定发生
} finally {
  this.registry.unregister(runId);
}
```

要点：`finalize` 一定被执行（try 正常出口或 catch 出口），`event:agent-done` 因此**每个 run 恰好一次**；`registerIpc` 不再有 `'unknown'` 兜底（runId 在 handler 生成并传入）。

### 2.3 RunRegistry（新文件 `src/main/agent/runRegistry.ts`）

```ts
export type ActiveRun = {
  /** 优雅中断（SDK control request）；同步包装，异常由调用方吞。 */
  interrupt: () => void;
  /** 强制终止（AbortController.abort()）。 */
  abort: () => void;
};

/** 活动 run 注册表。无 Electron 依赖 —— vitest 直测 stop 语义。 */
export class RunRegistry {
  register(runId: string, run: ActiveRun): void;
  unregister(runId: string): void;
  /** 中断+终止指定 run。未知 runId 返回 false；已 unregister 后再 stop 返回 false。 */
  stop(runId: string): boolean;
  has(runId: string): boolean;
}
```

### 2.4 renderer Item 数据模型（AgentPanel 重构，G2 的解）

```ts
type RunItem = {
  kind: 'run';
  runId: string;
  source: string;                          // 'chat' | 'cron:<name>' —— banner 门控
  steps: AgentStep[];                        // 步骤行（seq 为 key）
  streamText: Array<{ uuid: string; text: string }>; // 打字机缓冲，按 msgUuid 分组（G3）
  status: 'running' | 'done' | 'error' | 'interrupted';
  finalText: string;                        // 终态权威回复（done 载荷 / result 步骤）
  expandedSeq: number | null;                 // 展开互斥（每容器一个，沿用）
  meta?: { cost?: number; durationMs?: number; sessionId?: string };
};

type Item = { kind: 'user'; text: string } | RunItem;
```

渲染与状态规则（对照 R1 §1.2/§2.3）：

| 规则 | 内容 |
|---|---|
| 气泡来源唯一化 | `send()` 只 push `{kind:'user'}` 并以 invoke 返回的 runId 创建空 `RunItem`（status running）；**不再 push assistant 气泡**。assistant 内容全部由 RunItem 渲染：running 时 `streamText` 拼接为 `.bubble.assistant.inline`（打字机）；终态时**一个** `.bubble.assistant` 渲染 `finalText`，inline 气泡同时移除——最终文本只出现一次（G2） |
| onAgentDone 只改终态 | 按 `r.runId` 找 RunItem → 写 `status/finalText/meta`；**绝不 append 新 item**。找不到（如 app 重启后残留事件）则忽略 |
| 打字机聚合（G3） | text 步骤：`isDelta:true` → 按 `msgUuid` 找条目**追加**（无则新建）；非 delta 全文 → 该条目**整段替换**；条目按首次出现顺序渲染。无 uuid（fake/旧 shape）落到 `'default'` 键——退化为 R1 的单缓冲覆盖语义，行为兼容 |
| busy / activeRunId | `send()` 置 `activeRunId=runId`；busy = 「activeRunId 的 RunItem.status==='running'」；done 事件清 busy。cron run 不影响 busy（R1 §4 并发语义） |
| stop（G11） | 停止按钮直接 `agent.stop(activeRunId)`，不再从 items 反查 |
| cron banner（G1） | 派生态：`items` 中 `source.startsWith('cron:') && status==='running'` 的 RunItem → banner 显示最新一个的 jobName；其 runId 的 done 到达即随 status 翻转消失。**按 runId 清除**，不依赖 busyRef |
| 步骤行 | `StepLine` 增：tool_result 右侧显示 `durationMs`（§4.4）；error 行可点击展开 detail JSON（G5）；RunItem 终态时容器加 `done` class 冻结 ⚙ 动画（G8） |

### 2.5 AgentStep 类型变更（`src/shared/types.ts`）

```ts
export type AgentStep = {
  runId: string; seq: number; time: number;
  type: 'text' | 'tool_start' | 'tool_result' | 'done' | 'error';
  text?: string; isDelta?: boolean;
  tool?: string; inputText?: string; detail?: string; ok?: boolean;
  source?: string;        // 新增：'chat' | 'cron:<jobName>'（service enrich，translator 不管）
  msgUuid?: string;       // 新增：text 步骤的来源 assistant 消息 uuid（delta 分组键）
  durationMs?: number;    // 新增：tool_result 的配对耗时（translator 计算）
};
```

### 2.6 stepTranslator 增量（纯函数，vitest 面）

```ts
export type TranslateState = {
  seq: number;
  pendingToolNames: Map<string, string>;   // tool_use_id → 工具名
  pendingToolStart: Map<string, number>;   // 新增：tool_use_id → 开始时刻
  runId: string;
  now: () => number;                        // 新增：可注入时钟（测试确定性）
};
export function newTranslateState(runId: string, now: () => number = Date.now): TranslateState;
```

翻译规则增补：

1. assistant text block → text 步骤带 `msgUuid: m.uuid`；
2. `stream_event.content_block_delta.text_delta` → `{type:'text', isDelta:true, msgUuid: m.uuid}`；
3. tool_result → 配 `pendingToolStart` 得 `durationMs`（缺配对时省略）；
4. `result`：`subtype==='success' && is_error===true` → **error 步骤**（detail `{subtype:'success', isError:true, error:<result 文本>}`），不再误报绿色 done；`subtype!=='success'` → error 步骤（现有行为保留）；
5. 其余未识别消息 → `[]`（不变，SDK 升级回归锚）。

中断合成的终止步骤**不在 translator**（SDK 无 interrupted result 形态，属 service 收口职责，见 §2.2/§4.5）。

---

## 3. 重点设计决策：R1 缺口逐项方案

### 3.1 G1（P0）：cron 步骤进 renderer —— StepBus

**问题**：`AgentStep` 无 `source`；Scheduler `onStep` 只写日志；`pushStep` 闭包捕获 `win`，renderer 生命周期耦合。

**方案**（三层合一）：

1. `AgentStep.source` 字段随步骤下发（service enrich，§2.5）；
2. `ClaudeAgentService` 内建 StepBus：每条翻译出的步骤与每个 run 的 done 都 publish 到 bus——**chat 与 cron 天然同一条流**，Scheduler 无需（也不应）注入 pushStep；
3. `main.ts` 单次订阅、每事件取当前 `mainWindow` 并 `isDestroyed()` 检查——**步骤分发不依赖任何特定 win 对象存活**；win 销毁期间事件丢弃（审计已落库），win 重建（macOS activate）自动恢复接收，无重复订阅、无泄漏。

Scheduler 侧只需：`streamRun(prompt, { runId, source: 'cron:'+job.name })`，不传 `onStep`（其逐级日志由 service 的 debug 打点替代）。done 也走 bus，所以 **cron run 的 done 事件能到达 renderer**——banner 的清除按 runId 匹配（R1 §4 的要求），不再依赖「busyRef 为 false 才清」。

**为什么选 service 内建 bus 而非 registerIpc 把 pushStep 传进 Scheduler 构造**：后者让 IPC 层（渲染关注点）倒灌进 Scheduler 依赖图，且 win 重建后 pushStep 闭包失效需要重新装配；bus 把「产生事件」与「转发到 renderer」彻底分层，Scheduler 与 registerIpc 互不感知，测试时 bus 可注入替身。

### 3.2 G2（P0）：最终文本三重渲染 —— 单一事实来源

**问题**：同一文本可能出现 3 次——步骤流 inline 气泡 + `onAgentDone` 追加的 assistant 气泡 + `send()` resolve 后再追加的气泡（事件先于 invoke resolve 到达时必然重复）。

**方案**：见 §2.4。核心三句话——

1. `send()` 只创建 user 气泡与空 RunItem，**从不创建 assistant 气泡**；
2. assistant 展示**只**由 RunItem 渲染（running=inline 打字机；终态=单一 finalText 气泡）；
3. `onAgentDone` **只更新既有 RunItem 的终态字段**，永不追加 item。

配合 §1.2 的 `agent:run` 即返 runId 契约，invoke 通道不再携带任何渲染语义——重复渲染的通道根源消失。

### 3.3 G3（P1）：delta 打字机覆盖语义

**问题**：renderer 把全部 text 步骤 `join('')`，delta + 全文重复。

**方案**：translator 透传 `msgUuid`（§2.6）；renderer 按 uuid 分组聚合（§2.4）：delta 追加、同 uuid 全文整段替换。**为什么按 uuid 分组而不是 R1 字面上的单一缓冲覆盖**：一次 run 含工具调用时会有**多条** assistant 消息、每条都可能带文本，单缓冲「全文到达即整段替换」会把前一条消息的正文吞掉。按 uuid 分组在「单条最终消息」的常见情形下与 R1 语义完全一致（该 uuid 条目被整段替换），多条消息时各自正确；无 uuid（fake 模式/旧 shape）退化到 `'default'` 键，行为回落为 R1 单缓冲。最终回复以 done 载荷 `result.text` 为准（inline 气泡在终态移除，天然满足「以全文为准」）。

### 3.4 G4（P1）：tool_result 工具耗时

**问题**：`toolTimes` 在主进程采集但未下发。

**方案**：把配对耗时算进 translator 纯函数（`pendingToolStart` + 注入 `now()`，§2.6）——比在 service 里补算更好：① 可 vitest（注入时钟得确定值）；② fake 模式自动获得同样字段（同一翻译层，AC10 的同构要求）。步骤增 `durationMs`，renderer tool_result 行右侧按 R1 §2.2 渲染 `X.Xs`（`Math.round(ms/100)/10`）。service 里原有的 `toolTimes` Map 删除（单一实现点）。

### 3.5 G5 + G6（P1）：中断/异常的终止状态 —— finalize 单收口

**SDK 事实**（§0.2，查证 0.3.278 sdk.d.ts）：**不存在 `subtype:'interrupted'` 的 result 消息**。`interrupt()` 是 control request（receipt 先于「被中断 turn 的 result」写入——result 可能仍会出现，subtype 无文档承诺）；`abort` 则让 `readMessages()` 在流尾 **throw AbortError**，且即便 result 已 yield 过，`waitForExit` 路径仍可能再抛。因此：

1. **stop 双段式**：`q.interrupt()`（优雅，让 CLI 尽量把进行中的 tool call 收尾并可能写尾部 result）→ 立即 `abort.abort()`（确定性终止，不依赖未文档化的 result 形态）。竞态由 finalize 幂等吸收。
2. **finalize 单收口**（§2.2 伪码）：try 正常出口与 catch 出口都调 `finalize`，`finalized` 守卫保证恰好一次。catch 区分：`abort.signal.aborted`（或 `AbortError` 实例）→ `interrupted:true, error:'interrupted by user'`；其他异常 → `error:String(e)`。
3. **终止步骤合成**：若 run 结束时**没有**发出过任何 `done`/`error` 步骤（中断/崩溃路径的常态），`finalize` 补发一条 error 步骤——`interrupted` 用 `{subtype:'interrupted'}`（UI 渲染为「⚠ 已中断」，黄色，R1 §2.5 视觉）；异常用 `{subtype:'error', error}`。步骤流因此**总有终止行**（G6）。
4. **pushDone 一定发生**：done 的发布只在 finalize 内——try/catch/finally 结构保证执行；`agent_runs` 终态（`status='failed'`、error 非空，AC3 要求）同点写入，不存在永久 running 行。
5. **registerIpc 兜底移除**：runId 由 handler 生成并传入 streamRun（§1.2），catch 里 `'unknown'` 的合成 done 删除；service 不 reject（§2.2 契约），最后的 `.catch` 只作为 service 自身 bug 的保险（log error + 合成 done，runId 真实）。
6. **error 行可展开**（G5）：renderer 给 error 行与 tool_result 同样的展开交互（`detail` JSON 进 `.step-json`）。

### 3.6 G7 + G8（P2/P2）：cron-banner 布局与动画冻结

| 缺口 | 方案（纯 renderer） |
|---|---|
| G7 banner 挤占 chat | `.agent` 行模板 `grid-template-rows: 55px 1fr auto` → `55px auto 1fr auto`：banner 有/无两种情况下「auto 行塌缩为 0」与「chat 拿 1fr 限高滚动」都正确。这是 G1 修复后 banner 真正出现的前置条件 |
| G8 ⚙ 恒旋转 | RunItem 终态时容器加 `done` class：`.step-group.done .step-icon.spin{animation:none}`。不改「⚙ = tool_start 类型标识」的语义（R1 §2.1 的约定），只在 run 终态冻结动画 |

### 3.7 G9（P2）：fake 模式延时钩子

`runFake` 消息循环间插入可配置延时（`fakeScript` 纯模块持有脚本，`runFake` 持有循环）：

- env `CREATOROS_FAKE_STEP_DELAY_MS`（默认 0，不改变现有 fake 行为）；每条 scripted 消息处理前 `await sleep(delay)`；
- **fake run 必须可 stop**（当前 `runFake` 不注册 active map，stop 对它恒 false——AC3 的 E2E 断言不了）：runFake 同样 `registry.register(runId, { interrupt: () => {}, abort })`，每个延时边界检查 `abort.signal.aborted`——中止则跳出循环、走同一 `finalize`（interrupted:true）路径；
- fake 的 result `session_id` 改为 `opts.resumeSessionId ?? \`fake-session-${runId}\``——续聊 E2E 才能断言「两行 session_id 关系」（AC4）；
- 消息 shape 以 SDK 0.3.278 实测为准固定在 `fakeScript.ts`（R0 风险表的既定缓解）。

延时默认 0 保证既有用例速度；E2E/截图显式注入（`launchApp` 透传 `CREATOROS_FAKE_STEP_DELAY_MS=400`，服务 R1 §9 的 S3/S4 截图）。

### 3.8 G10 / G11 / G12

| 缺口 | 方案 |
|---|---|
| G10 e2e 环境变量 | `e2e/helpers.ts`：删 `CREATOROS_AGENT_PROVIDER:'mock'`，注 `CREATOROS_FAKE_CLAUDE:'1'`；`e2e/debug-flow.mts` 同步或删除（AC11 grep 范围内） |
| G11 stop 反查 runId | `agent:run` 即返 runId（§1.2）+ RunItem.activeRunId state（§2.4）——结构性消除，无需从 items 反查 |
| G12 Automation 表单 | 前端：`workflowType==='agent.run' && !prompt.trim()` 时 Create disabled 并提示必填；Jobs 列表 agent.run 项显示 prompt 首行摘要（`.muted` 截断）。后端兜底见 §1.4 |

---

## 4. AC → 方案锚点 → 测试映射（R4 检查表输入）

| AC | 方案锚点 | 测试（层:内容） |
|---|---|---|
| AC1 步骤流实时 | §2.2/§2.5/§3.1 | E2E:fake 序列 tool_start→tool_result→text→done、seq 单调、UI 行数随事件增长（配合 G9 延时）；vitest:fakeScript |
| AC2 delta 打字机 | §2.6 规则 1/2、§3.3 | vitest:translator delta/全文/uuid 分组（离线断言翻译纯函数） |
| AC3 停止中断 | §3.5 双段式 + finalize；§2.3 registry | E2E:延时 fake 中途 stop（无新步骤、agent_runs failed error 非空、busy 解除）；vitest:runRegistry 未知 runId false |
| AC4 续聊 resume | §2.2 resumeSessionId；§3.7 fake echo | E2E:两次 run 断言 agent_runs 两行 session_id 关系 + 面板「会话已续接」；vitest:fakeScript resume 透传 |
| AC5 配置热生效 | §1.6 started 日志 meta（baseUrl/model） | E2E:save 改值→run→日志/step meta 变化；重启同 userData `settings.get()` 一致 |
| AC6 旧配置迁移 | §1.3 读路径惰性迁移 | vitest:SettingsStore 注入含 provider 行（已有用例保留） |
| AC7 Test connection | `testConnection()` 不变（fake 分支已有） | E2E:fake `{ok:true,detail:'fake mode'}`；真实连通人工验证 |
| AC8 cron 同引擎 | §3.1 StepBus + §1.4 校验 + Scheduler `result.ok` 分流 | E2E:建 job→`POST /api/jobs/:id/run`→agent_runs/job_runs 双表、banner 出现/按 runId 清除；空 prompt job failed |
| AC9 审计落库 | §2.2 finalize 落库（含 steps_json 策略 §1.3） | E2E:成功+中断两 run，sqlite 只读直查字段与终态 |
| AC10 全离线 | §3.7 fake + §3.8 G10 | E2E 本身（launchApp env + fixture 127.0.0.1:17992） |
| AC11 旧代码移除 | §1.1 #2/#20（ipc.ts legacy 常量、helpers env） | R3 自检 grep 零命中 + typecheck；E2E 重写后编译期保证 |
| AC12 IPC 四处同步 | §1.2 变更表 | typecheck（4×）+ E2E 经 `window.creatorOS.agent.*` 隐式验证；R3 自检逐处核对 |
| AC13 日志可追溯 | §1.6 打点表（文案为锚） | E2E:`logs.list({module:'agent'})` 断言 started/finished 与 meta.runId |

---

## 5. 风险与缓解（R0 风险表的架构级补充）

| 风险 | 影响 | 缓解 |
|---|---|---|
| SDK 流消息结构随 0.3.278 之后版本变化 | 翻译错漏/静默丢步 | translator 纯函数 + vitest 契约用例（含「未识别→[]」）；SDK 事实表（§0.2）升级时逐条复核；锁 `^0.3.278` |
| 中断路径的 result/throw 竞态 | done 双发或漏发 | finalize 幂等守卫（首个生效）；E2E 中断用例固化行为 |
| bus 无缓冲 + win 销毁 | renderer 错过事件 | 定案：renderer 是临时视图，审计以 agent_runs/日志为准；不做回放（范围外，如需另立 spec） |
| steps_json 膨胀 | 行过大/写放大 | 非 delta 步骤 + 单步截断 + 256KB 上限丢中间段（§1.3） |
| `agent:run` 契约变更破坏调用方 | 编译期暴露遗漏 | 四处同步（global.d.ts/preload/registerIpc/shared）+ typecheck 全绿即闭包；renderer 唯一调用点 AgentPanel 同 PR 改 |
| fake 与真实 SDK 漂移 | E2E 绿但线上不符 | fake 复用同一 translator（G3/G4 字段在 fake 序列同样出现）；消息 shape 固定于 fakeScript 并标注 SDK 版本 |
| 子进程 spawn 开销 | 每次 run 固定延迟 | 维持 R0 决策（每 run 一个 query），性能不达标再评估进程内 transport（范围外） |
| bypassPermissions 权限面 | agent 无确认执行浏览器动作 | 沿用 R0 缓解：system prompt 高危动作先确认 + allowedTools 仅浏览器工具；收紧另立 spec |

---

## 6. R3 自检清单（开发对照）

- [ ] `shared/ipc.ts` 中 `AGENT_CHAT`/`EVENT_AGENT_TOKEN` 已删；`grep -r "CREATOROS_AGENT_PROVIDER\|compatBaseUrl\|AGENT_CHAT\|EVENT_AGENT_TOKEN" src e2e tests scripts` 零输出（豁免：settings.ts 迁移分支注释、spec/CHANGELOG 历史记载）
- [ ] IPC 四处逐项核对：`shared/ipc.ts` 常量 / `preload.cts` 白名单与方法 / `registerIpc` handler / `global.d.ts` 类型（`agent.run` 返回 `{runId}`）
- [ ] `AgentStep`（source/msgUuid/durationMs）与 `AgentRunResult`（error/interrupted/source）类型四处生效，typecheck 4× 绿
- [ ] `streamRun` 不 reject（run 级失败 resolve ok:false）；`finalize` 幂等；done 每 run 恰一次；中断合成终止步骤
- [ ] Scheduler `agent.run` 分支按 `result.ok` 分流 job_runs 终态；空 prompt 运行期报错保留
- [ ] `steps_json` 按 §1.3 策略写入；中断 run 的 `agent_runs` 为 failed + error 非空
- [ ] `main.ts` bus 订阅一次、forwarder 取当前 `mainWindow` + `isDestroyed` 检查；win 重建无重复订阅
- [ ] app.css 无新增 hex（`.step-group.done .step-icon.spin` 只用既有 token）；`.agent` 行模板 4 行
- [ ] agent 打点文案未改（`Agent run started` / `Agent run finished` / `Agent run failed`），meta 含 runId，无 token 值
- [ ] vitest 新增：translator 新规则、runRegistry、fakeScript；E2E 新增/重写按 §1.7
- [ ] `npm run db:generate` 迁移记录已提交，`drizzle/` 与 schema.ts 一致

R4 双层测试齐 → G 门禁（`npm run gate` 全绿 + AC 逐条对应 + UI 对图存档）→ R5。
