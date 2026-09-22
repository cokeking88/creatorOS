# CreatorOS 代码评审报告 — v0.3（Agent 内核替换为 Claude Code SDK）

> 评审范围：commit `edf75a3`（v0.3 全量：52 个文件）
> 评审日期：2026-09-22
> 评审方式：自动化多角度审查（正确性/回归/竞态/资源/文档一致性）+ 逐条代码级验证
> 结论：**8 项 CONFIRMED（代码确认）+ 2 项 PLAUSIBLE（合理推断，依赖运行时状态）**，无阻断级（blocker）缺陷；发布质量达标，建议按优先级排期修复。

---

## 总览

| # | 严重度 | 置信度 | 一句话 | 位置 |
|---|---|---|---|---|
| 1 | **高** | CONFIRMED | Agent 服务单例在 macOS 窗口重建后仍持有已销毁的旧 BrowserKernel | `claudeAgent.ts:299` |
| 2 | **高** | CONFIRMED | cron 运行的 sessionId 会污染聊天的续聊会话 | `AgentPanel.tsx:109` |
| 3 | **高** | CONFIRMED | 真实运行时每个工具调用会渲染两个 ⚙ 行（stream_event 与完整消息双发） | `stepTranslator.ts:49` |
| 4 | **高** | CONFIRMED | 无人值守 cron 的 agent.run 无 maxTurns/maxBudgetUsd 上限，成本失控风险 | `claudeAgent.ts:86` |
| 5 | **中** | PLAUSIBLE | 并发 agent run 共享单一活动标签页，导航/点击互相踩踏 | `Scheduler.ts:28` |
| 6 | **中** | CONFIRMED | IPC 的 JOB_CREATE 无校验，坏 cron 静默入库且永不调度 | `registerIpc.ts:30` |
| 7 | **中** | CONFIRMED | v0.2 旧 settings 迁移分支不可达（查错 key），旧 `provider` 行成孤儿数据 | `settings.ts:26` |
| 8 | **中** | CONFIRMED | streamRun 文档承诺「永不 reject」，但 agent_runs INSERT 在 try 外，DB 故障时聊天 RunItem 永久卡「运行中」 | `claudeAgent.ts:115` |
| 9 | **低** | PLAUSIBLE | steps_json 的 256KB 上界实际未强制（截断条件与单行长度未夹紧） | `claudeAgent.ts:44` |
| 10 | **低** | CONFIRMED | 进程内工具表与外部 MCP 桥两处平行声明已发生漂移，违反架构规范 §1.5 | `browserTools.ts:19` |

---

## 详细发现

### 1.（高·确认）Agent 服务单例在窗口重建后持有已销毁的 BrowserKernel

`initClaudeAgent()` 是模块级单例（`if (!service)`），首次创建后永久持有第一个 `BrowserKernel`（含 MCP server 闭包捕获）。但 `main.ts` 在 macOS `activate`（点 Dock 图标重开窗口）时会 `createWindow()` 重建 BrowserKernel——此时 `initClaudeAgent(kernel)` 直接返回**旧 service**，绑定的是已销毁的旧 kernel。

**后果**：关闭所有窗口再重开后，agent 对话能跑，但**每一次 browser_* 工具调用**都会撞上 Electron "Object has been destroyed"。
**v0.2 对比**：`AgentRuntime` 是每窗口 new 的，无此问题——这是本次替换引入的**回归**。

**建议修复**：`initClaudeAgent` 改为 `(kernel) => { service?.rebind(kernel) ?? (service = new ClaudeAgentService(kernel)) }`，或放弃单例、每窗口重建并重挂 StepBus 订阅。

### 2.（高·确认）cron 的 sessionId 污染聊天续聊

`AgentPanel.onAgentDone` 对**每一个** done 事件都 `setSessionId(res.sessionId)`——包括 `source='cron:*'` 的运行。聊天与 cron 共用事件总线的代价：cron 跑完后，用户下一条消息会以 cron 的会话 resume，聊天上下文直接接上无人值守任务的 transcript（互相污染，双向成立）。

**建议修复**：done 处理仅当 `source==='chat'` 时采纳 sessionId；cron 会话如需展示应存于 job_runs（已存）。

### 3.（高·确认）工具调用双行渲染（真实运行）

`includePartialMessages: true` 时 SDK 对同一 tool_use 先发 `stream_event(content_block_start)` 再发含完整块的 assistant 消息；translator 两个分支都推 `tool_start` → 每个工具调用渲染两个 ⚙ 行、seq 翻倍、durationMs 被第二条覆盖导致偏低。**fake 脚本没有 stream_event，所以 27 个 e2e 用例全绿也没能暴露**——真实网关联调时必然显现。

**建议修复**：translator 维护「已见 tool_use id」集合，stream_event 只对未见过的 id 发 tool_start；assistant 完整块分支同去重。

### 4.（高·确认）无人值守运行无成本上限

旧 AgentRuntime 有硬性 10 步上限；新 SDK options 未设 `maxTurns`/`maxBudgetUsd`（SDK 明确提供，`sdk.d.ts:1837`）。`permissionMode:'bypassPermissions'` 的 cron 子进程遇到诱导循环的 prompt（"keep refreshing until…"类）会整夜空转烧钱，且无 UI 停止按钮可及。

**建议修复**：cron 路径强制 `maxTurns`（如 40）+ `maxBudgetUsd`（如 0.5）；聊天路径可不设。

### 5.（中·合理推断）并发 run 共享单一活动标签页

聊天与 cron 的 `streamRun` 并发时操作同一 BrowserKernel 的同一 active tab：一个 run 的 navigate 会使另一个 run 的元素 ref 失效（"ref not found"）甚至误点到对方刚导航到的页面——叠加 prompt 级确认的弱点，误发风险真实存在。M3 发布确认门落地前，建议先做**run 串行化**（同一时刻只允许一个 run 持有浏览器）或按 Profile 隔离 tab。

### 6.（中·确认）IPC JOB_CREATE 无校验

Gateway 的 `POST /api/jobs` 有完整校验（400/201），但 Automation 表单走的是 **IPC**——`registerIpc` 的 `JOB_CREATE` 直接 `repo.createJob(input)` 无任何校验。坏 cron（如 5 段式）静默入库为 enabled=1，`reload()` 里 `cron.validate` 不过直接跳过，UI 里显示一个永远不跑的"启用中"任务。**Gateway 的校验注释写着"backstop for the Automation form"，但表单根本不走 Gateway——防线架错了地方。**

**建议修复**：把 Gateway 的校验抽成共享函数，IPC 入口同调用；或表单改走 Gateway。

### 7.（中·确认）v0.2 settings 迁移分支不可达

迁移代码检查的是 `'provider' in parsed`，但读的是**新 key** `agent-engine` 的行；v0.2 实际把 provider 配置存在 key **`provider`** 下——该行对新代码不可见，永远不会被读到或清理。效果上"回落 env"歪打正着地发生了（行查不到→env 分支），但 SECURITY.md #8 宣称的"legacy rows are migrated on read"并未实现，孤儿行永久留在表里，且单测测的是一个**从未被真实写出的形状**（用 `agent-engine` key 插 legacy 数据）。

**建议修复**：读侧显式 `SELECT value FROM settings WHERE key IN ('agent-engine','provider')`，命中旧行则返回 env 派生配置并删除旧行；同步修单测。

### 8.（中·确认）「streamRun 永不 reject」承诺被 INSERT 破坏

`agent_runs` 的 INSERT（及 `getAgentEngineConfig`）在 try 块之外。SQLite 写失败（磁盘满/锁死/损坏）时 promise 直接 reject：聊天路径的 fire-and-forget catch 只记日志、不发 done 事件 → renderer 的 RunItem 永久 `running`、composer 永久禁用、停止按钮调 stop 返回 false。Scheduler 路径碰巧有 catch 能落 failed。类文档与架构规范 §2.2「finalize 单收口」的承诺被入口破坏。

**建议修复**：INSERT 移入 try，或包一层 catch 转 finalize(error)。

### 9.（低·合理推断）steps_json 尺寸上界未真正生效

截断条件要求 `json.length > 256KB` **且** `rows.length > 200` 同时成立；且保留的 200 行每行 text 不截。一次长生成的终文本可达数百 KB 且行数 ≤200 → 不截断，超限 JSON 整体 UPDATE 入库。建议改为：先按 256KB 截、行内 text 再夹紧到固定字符数。

### 10.（低·确认）内外工具面双声明已漂移

架构规范 §1.5 自己要求「工具名/description/schema 抽到共享定义」，但 `browserTools.ts` 与 `scripts/mcp-stdio.ts` 平行维护：外部桥已有第 16 个工具（`job_run`）而进程内没有，description 措辞不同、序列化格式不同。每加工具都要手抄两份，内外 agent 能力面将持续发散。建议抽 `src/shared/browserToolDefs.ts` 两边共用。

---

## 修复优先级建议

| 批次 | 内容 | 理由 |
|---|---|---|
| 立即（随下个 hotfix） | #1 单例重绑、#2 cron sessionId 隔离、#3 tool_start 去重 | 真实使用一触即发/必然显现 |
| 近期 | #4 cron 成本上限、#6 IPC 校验复用、#7 迁移修正、#8 finalize 收口 | 无人值守与数据完整性 |
| 排期 | #5 run 串行化（并入 M3 确认门一起做）、#9 截断夹紧、#10 工具定义共享 | 架构卫生 |

## 评审方法说明

- 多角度扫描（正确性/回归/资源/竞态/文档-代码一致性）中 8 个并发子任务因环境路由故障未起，评审在主上下文逐角度串行完成，随后对每个候选发现做**代码级验证**（对照 `sdk.d.ts` 类型契约、调用方、项目自身架构/安全规范）。
- 验证口径：标注 CONFIRMED 的均有直接代码/类型证据；PLAUSIBLE 依赖合理但未强制触发的运行时状态，均无守卫排除。
- 本次 v0.3 的 **e2e 假脚本不含 stream_event**，故 #3 类「fake 与真实 SDK 行为差异」问题在 CI 中不可见——建议在 fakeScript 中加入可选 stream_event 形状以覆盖翻译器全分支（可作为 #3 修复的一部分）。
