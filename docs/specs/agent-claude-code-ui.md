# v0.3 UI 设计（R1）— Agent 内核 Claude Code + 执行步骤实时流式展示

> 阶段：R1 UI 设计产物（对应 `docs/WORKFLOW_CN.md` §2）。
> 需求基线：`docs/specs/agent-claude-code.md`（R0，验收标准 AC1–AC13）。
> 设计基线来源：以下设计**不是重新发明**，而是把已落地的实现沉淀为设计定义（`src/renderer/components/AgentPanel.tsx`、`src/renderer/pages/SettingsPage.tsx`、`src/renderer/pages/AutomationPage.tsx`、`src/renderer/styles/app.css`、`src/main/agent/stepTranslator.ts`、`src/main/agent/claudeAgent.ts`）。与设计定义不符的实现项列入 §10 缺口清单，作为 R2/R3 的输入。
> 主题铁律：全部视觉沿用现有暗色变量（§9），禁止引入第二套色值。

---

## 0. 覆盖范围与 R0 验收标准映射

本设计覆盖三个页面/组件：

| UI 面 | 文件 | 涉及 R0 验收标准 |
|---|---|---|
| Agent 面板（右侧栏） | `src/renderer/components/AgentPanel.tsx` | AC1（步骤流实时）、AC2（打字机）、AC3（停止）、AC4（续聊指示）、AC8（cron 同流可见） |
| Settings 引擎配置页 | `src/renderer/pages/SettingsPage.tsx` | AC5（热生效）、AC6（旧配置迁移）、AC7（Test connection） |
| Automation 定时任务页 | `src/renderer/pages/AutomationPage.tsx` | AC8（agent.run job 表单） |

AC9–AC13（审计落库、离线 E2E、旧代码移除、IPC 同步、日志）无独立 UI 面，不在本文档范围。

---

## 1. Agent 面板总布局线框（AgentPanel）

面板为应用三栏网格的第三栏（`.app` grid 84px / 1fr / 330px；视口 ≤1150px 时收窄为 280px）。自身为纵向 grid，从上到下：header（55px 固定）→ cron 运行条（条件出现）→ chat 滚动区（占满剩余）→ composer 输入区（自适应）。

```
┌ .agent 侧栏（330px；≤1150px 视口时 280px）──────────────────────┐
│ Agent                                    Claude Code │ header 55px
├──────────────────────────────────────────────────────────┤  busy 时右侧文本 → 「运行中…」
│ ⏱ Cron job 每日巡检 运行中…                              │ .cron-banner（仅 cron 触发，见 §6）
├──────────────────────────────────────────────────────────┤
│  .chat（1fr，overflow:auto，每步到达即滚到底）             │
│                                                          │
│                       ┌────────────────────────────┐  │
│                       │ 打开小红书创作中心并检查登录 │  │ .bubble.user（右对齐）
│                       └────────────────────────────┘  │
│   ┌ .step-group（本轮 run 的步骤流容器）─────────────┐  │
│   │ ⚙ mcp__creatoros-browser__browser_navigate       │  │ .step（tool_start，⚙ 旋转）
│   │    展开                              14:02:11   │  │
│   │    ┌ .step-json ─────────────────────────┐      │  │
│   │    │ {"url":"https://creator.xiaohongshu.com"} │  │ 展开后的 input JSON
│   │    └─────────────────────────────────────┘      │  │
│   │ ✓ mcp__creatoros-browser__browser_navigate      │  │ .step.result.ok（✗ 为 .fail）
│   │    详情                             14:02:13 2.1s│  │ 右侧为工具耗时（缺口 G4）
│   │ ▌已打开创作中心，正在检查登录状态…                │  │ text delta 打字机（inline 气泡）
│   │ ● 完成                          $0.0123   3.4s  │  │ .step.done（cost + 时长）
│   └────────────────────────────────────────────────┘  │
│   ┌──────────────────────────────────────────┐  │
│   │ 创作中心已打开，登录状态正常。最近一次发文是…   │  │ .bubble.assistant（最终回复）
│   └──────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────┤
│  .composer                                               │
│  ┌────────────────────────────────────────────────┐  │
│  │ textarea（84px；Enter 发送，Shift+Enter 换行）    │  │
│  └────────────────────────────────────────────────┘  │
│  会话已续接                                  [ ■ 停止 ]  │ .composer-actions
│                                        （空闲时 → [ 发送 ]）│
└──────────────────────────────────────────────────────────┘
```

### 1.1 区域尺寸与色值（全部来自现有 app.css，不新增）

| 区域 | 尺寸 | 背景 / 边框 |
|---|---|---|
| `.agent` 侧栏 | 宽 330px（断点 280px） | `#14171d` / 左边框 `#242832` |
| header | 高 55px，padding 0 15px | 底边框 `#242832`；标题粗体，右侧状态 12px `#727c8e` |
| `.chat` | flex 剩余（1fr），padding 14px，overflow auto | 透明（继承侧栏底色） |
| `.bubble.user` | 圆角 11px，padding 10px 12px，margin-left 30px | `#2a3347` |
| `.bubble.assistant` | 同上，margin-right 20px | `#1c222c` |
| `.step-group` | margin 6px 0 | 透明 |
| `.composer` | padding 12px，顶边框 `#242832` | textarea：高 84px、圆角 9px、底 `#0f1218`、边框 `#303746` |

### 1.2 消息流结构（一次 run → 多轮循环）

消息数组按时间顺序渲染为三类条目，循环重复：

```
user 气泡（本轮指令）
  → steps 容器（.step-group：本轮 run 的全部 AgentStep 行 + inline 文本气泡）
    → assistant 气泡（本轮最终回复）
      → （下一轮 user 气泡，续聊时复用同一 sessionId）
```

- steps 容器按 `runId` 归组：`event:agent-step` 到达时，找到**同 runId 的最后一个** steps 容器追加一行；找不到则新建容器（见 AgentPanel onStep 逻辑）。
- 运行中的 assistant 气泡带 `.pending`（opacity .75），`event:agent-done` 到达后填充最终文本并去掉 pending。
- 行 key 用 `step.seq`（单调递增），保证增量追加不重渲。

### 1.3 运行中 / 停止 / 续聊 / 会话标签

| 元素 | 定义 |
|---|---|
| 运行中指示 | header 右侧状态文本由 `Claude Code` 切换为 `运行中…`（busy=true） |
| 停止按钮 | busy 时 composer-actions 右侧由「发送」(`.primary` 蓝 `#6f8ff`) 换成「■ 停止」(`.composer-actions button.stop`，底色 `#8a3535`)；点击调 `agent.stop(runId)`，busy 解除后自动换回发送按钮 |
| 会话标签 | composer-actions 左侧 `.muted.small` 文本：无会话时「新会话」，拿到 sessionId 后「会话已续接」 |
| 续聊状态行 | textarea placeholder 随会话切换：`给 Agent 下指令…` → `继续对话（保留上下文）…` |
| 键盘 | Enter 发送、Shift+Enter 换行；busy 时 Enter 静默忽略 |

---

## 2. 五类步骤行视觉定义（tool_start / tool_result / text / done / error）

步骤行统一解剖（`.step`：flex、gap 8px、padding 5px 10px、字号 12px、色 `#9aa6b8`、圆角 7px、hover 底 `#1a1f29`、允许换行）：

```
[ .step-icon 16px ] [ .step-label 等宽字体 ] [ .step-hint ] <margin-left:auto> [ .step-time ]
```

| 项 | 定义 |
|---|---|
| 图标列 | `.step-icon` 宽 16px 居中 |
| 标签 | `.step-label`：ui-monospace 11.5px，色 `#c6d0e0`，内容为原始工具名（如 `mcp__creatoros-browser__browser_navigate`） |
| 提示 | `.step-hint`：11px `#67718a`，展开功能的可发现性提示 |
| 时间 | `.step-time`：10.5px `#5b6575`，`toLocaleTimeString()`（HH:MM:SS），右对齐 |

### 2.1 tool_start 行

| 属性 | 定义 |
|---|---|
| 图标 | `⚙`，`.step-icon.spin`：1.2s linear infinite 旋转动画，色 `#7c9cff`（品牌蓝） |
| label | `step.tool`（完整 MCP 工具名） |
| hint | `step.inputText` 非空时显示 `展开`；已展开显示 `收起` |
| time | 事件到达时刻 |
| 展开交互 | 点击整行 toggle；展开后在行内下方渲染 `.step-json`（pre 块）：底 `#10141b`、边框 `#232a38`、圆角 7px、11px 等宽、`white-space:pre-wrap; word-break:break-all`、max-height 200px overflow auto；内容为序列化的工具 input JSON |
| 语义说明 | ⚙ 旋转是 **tool_start 行的类型标识**，不代表「该工具仍在执行」（进行中状态由其后是否出现配对的 tool_result 行判断）。run 终止后冻结动画列为缺口 G8 |

### 2.2 tool_result 行

| 属性 | 定义 |
|---|---|
| 类 | `.step.result.ok` / `.step.result.fail` |
| 图标 | 成功 `✓`（色 `#5fc98c`）；失败 `✗`（色 `#e25b5b`） |
| label | `step.tool`（与 tool_start 同名，配对可读） |
| hint | `step.detail` 非空时显示 `详情`；已展开显示 `收起` |
| time（设计目标） | **工具耗时**（如 `2.1s`），由主进程记录 tool_start→tool_result 时间差。当前实现只显示到达时刻且耗时数据（toolTimes）已采集未下发——缺口 G4 |
| 展开交互 | 点击整行 toggle，`.step-json` 显示 `step.detail`（工具结果摘要文本，最多 400 字符） |

### 2.3 text 行（打字机，不是「行」）

text 步骤**不渲染为独立步骤行**，渲染为步骤容器末尾的 inline 文本气泡 `.bubble.assistant.inline`（透明底、margin-left 18px、色 `#cfd8e6`）：

- **打字机语义（AC2）**：`isDelta:true` 的 text 步骤按到达顺序**追加**到打字机缓冲；同轮非 delta 全文 text 步骤到达后**整段替换**缓冲（覆盖，非拼接）。最终回复以全文为准。
- 打字机光标 `▌` 为可选增强（CSS 动画），非 v0.3 基线必需。
- 缺口 G3：当前实现把全部 text 步骤（含 delta 与全文）`join('')` 渲染，delta 场景下同一文本重复显示，不满足覆盖语义。

### 2.4 done 行

| 属性 | 定义 |
|---|---|
| 类 | `.step.done`，图标 `●`，色 `#5fc98c` |
| label | `完成` |
| 右侧指标 | 解析 `detail` JSON：`cost` 为数值时显示 `$` + `toFixed(4)`（如 `$0.0123`）；`durationMs` 为数值时显示一位小数秒数（`Math.round(ms/100)/10 + 's'`，如 `3.4s`）。两个指标都用 `.step-time` 样式靠右排 |
| 交互 | 不展开、不可点击（run 级审计数据已入 `agent_runs`，面板不重复展示原始 JSON） |

### 2.5 error 行

| 属性 | 定义 |
|---|---|
| 类 | `.step.error`，图标 `⚠`，色 `#e2b93b`（黄，同 logs warn 色） |
| label | `出错` |
| 展开交互（设计目标） | 同 tool_result：点击展开 `.step-json` 显示 detail（JSON：`{subtype, error}`），让用户看到错误摘要。当前实现不可展开、错误摘要不可见——缺口 G5 |

### 2.6 展开态总规则

- 每个 steps 容器内**同时最多展开一行**（`expandedSeq` 单值，互斥）；点另一行自动收起前一行。跨容器互不影响。
- 展开态行背景 `.step.open` = `#1a1f29`（与 hover 一致，保持视觉连续）。
- 展开内容 `pre.step-json` 占行宽 100%（`flex-basis:100%`）。

---

## 3. 交互三态（含 WORKFLOW §2 交互状态三问）

面板状态机：`idle ⇄ busy`；`busy →(done|error|中断) idle`。

### 3.1 运行中（busy，加载中态 —— 三问之「加载中」）

- header：`运行中…`；composer 右侧：`■ 停止`（可见、可点）。
- 步骤实时追加：每条 `event:agent-step` 到达**立即**渲染一行（流式，非跑完回放——AC1）。
- 自动滚动：每个步骤到达后 `chat.scrollTop = scrollHeight` 强制滚底。设计决策：v0.3 采用强制滚底，不做「用户上滚暂停自动滚动」（列为后续增强，不实现）。
- assistant 气泡处于 `.pending`（opacity .75）；运行中即可见 inline 打字机文本逐字增长（真实 SDK + includePartialMessages）。

### 3.2 空闲（idle）

- header：`Claude Code`；composer 右侧：`发送`（`.primary` 蓝）。
- 发送条件：输入非空且非 busy。
- 会话标签/placeholder 按 §1.3。

### 3.3 出错（error —— 三问之「出错」）

- 引擎返回失败 result → 翻译为 error 步骤行（§2.5，黄 ⚠）。
- 工具失败 → 对应 tool_result 行 `✗`（红）+ 可展开错误详情。
- run 级异常（IPC reject / 进程错误）→ 面板追加 assistant 气泡显示 `Error: <message>`（当前实现行为，保留为兜底）。设计目标：中断路径也应有终止状态行（缺口 G6）。

### 3.4 空数据态（三问之「空数据」）

```
│  .chat（空态）                              │
│                                            │
│     内置 Agent 现由 Claude Code 驱动。        │
│     执行步骤会在这里实时展示。                  │
│                                            │
```

- `.muted` 居中提示文案：`内置 Agent 现由 Claude Code 驱动。执行步骤会在这里实时展示。`
- composer 始终可用（空态不置灰）。

---

## 4. cron 运行条（cronBanner）

cron `agent.run` 触发时，Agent 面板顶部（header 与 chat 之间）显示运行条，让无人值守运行**在聊天面板可见**（R0 AC8：聊天与 cron 同一条步骤流）。

| 项 | 定义 |
|---|---|
| 样式 | `.cron-banner`：padding 7px 15px、底色 `#232a1f`、文字 `#b7d99a`（低饱和绿，区别于聊天运行态的品牌蓝）、12px、底边框 `#242832` |
| 文案 | `⏱ Cron job <jobName> 运行中…`（jobName 来自 run 的 source：`cron:<jobName>`） |
| 出现时机 | renderer 收到**首个** `source` 以 `cron:` 开头的步骤事件（该 run 的 seq=1） |
| 消失时机 | 该 runId 的 `event:agent-done` 到达（无论成败） |
| 并发语义 | cron 运行条与聊天 busy **相互独立**：cron 跑时用户仍可发聊天指令，banner 不占用停止按钮（停止按钮只作用于本面板发起的聊天 run）；多个 cron run 并发时 banner 只显示最近一个（文案单条，不堆叠） |
| 布局约束 | banner 是 grid 的第 2 行；`.agent` 的行模板必须允许 4 个子元素（缺口 G7，见下） |

**实现缺口（P0，G1）**：当前 `AgentStep` 类型无 `source` 字段，且 Scheduler 的 `onStep` 只写日志、未接入 `registerIpc` 的 `pushStep` 广播——cron 步骤根本到不了 renderer，`cronBanner` state 永远为 null。R2 需：`AgentStep` 增加 `source?: string`；Scheduler `agent.run` 分支复用与聊天相同的 `pushStep` 广播；AgentPanel 依 `step.source.startsWith('cron:')` 显示 banner、依 `onAgentDone(runId)` 清除。清除逻辑按 runId 匹配，而非当前的「busyRef 为 false 才清」。

---

## 5. Settings 页引擎配置

页面结构：`.page` > h1 `Settings` > muted 说明行 > `.content-grid`（1fr / 1.3fr 双栏）。

```
┌ Settings 页 ─────────────────────────────────────────────────┐
│ Settings                                                       │
│ 内置 Agent 引擎为 Claude Code（Agent SDK 子进程）。             │
│ 以下为 Anthropic 协议接入配置，保存即热生效。                     │
│ ┌ panel：Agent Engine · Claude Code ──────┐ ┌ panel：引擎说明 ──┐ │
│ │ [Base URL__________________________]   │ │ 内核：Claude Code  │ │
│ │   （默认 https://api.anthropic.com；     │ │  Agent SDK（每次  │ │
│ │    公司网关填这里）                      │ │  运行 spawn 子进程）│ │
│ │ [Auth Token ●●●●●●●（Bearer）]        │ │ 浏览器工具：进程内  │ │
│ │ [API Key ●●●●●●●（x-api-key）]        │ │  MCP server（与外 │ │
│ │ [Model________________（claude-…）]   │ │  部 MCP 桥同面）   │ │
│ │ [Save]  [Test connection]             │ │ 会话隔离：         │ │
│ │ ✓ 已保存并立即生效，无需重启            │ │  CLAUDE_CONFIG_DIR │ │
│ │ ✓ 引擎连通                              │ │  指向应用数据目录  │ │
│ │   fake mode                             │ │ 执行步骤实时推送，  │ │
│ │                                        │ │  聊天与 Cron 共用  │ │
│ └────────────────────────────────────────┘ └────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 5.1 四个配置字段（`.field`，含 label 即 placeholder，无独立 label 行）

| 字段 | 类型 | placeholder（即说明文字） | 落到引擎 |
|---|---|---|---|
| Base URL | text | `Base URL（默认 https://api.anthropic.com；公司网关填这里）` | `ANTHROPIC_BASE_URL` |
| Auth Token | password | `Auth Token（→ ANTHROPIC_AUTH_TOKEN，Bearer）` | `ANTHROPIC_AUTH_TOKEN` |
| API Key | password | `API Key（→ ANTHROPIC_API_KEY，x-api-key；与 Token 二选一，Token 优先）` | `ANTHROPIC_API_KEY`（authToken 同时设置时被忽略） |
| Model | text | `Model（如 claude-sonnet-4-5）` | `ANTHROPIC_MODEL` |

两个密钥字段用 `type=password` 遮蔽。字段留空 = 不注入该 env（回落默认）。

### 5.2 操作行与结果区

| 元素 | 定义 |
|---|---|
| Save | `.primary` 蓝，`settings.set` 后显示 `.ok-msg`：`已保存并立即生效，无需重启`（AC5 热生效的用户可见确认） |
| Test connection | `.row` 内次按钮；点击**先 save 再 test**；进行中按钮文案 `Testing…` 且 disabled |
| 测试结果 | 成功：`.ok-msg` `✓ 引擎连通`；失败：`.err-msg` `✗ 连接失败`；detail 非空时下方 `.test-detail`（`code` 块：底 `#11151c`、圆角 8px、11.5px、break-all）显示原始返回——fake 模式为 `fake mode`，真实模式为引擎回包文本或错误摘要（30s 超时 abort） |
| 加载中 | `settings.get` 返回前 `loaded=false`：Save / Test 均 disabled |
| 空数据 | 全字段空、显示 placeholder；首次保存即写入 `agent-engine` 配置行 |
| v0.2 迁移 | 旧 `provider-config` 行不在 UI 呈现任何旧字段（`provider`/`anthropicKey`…一律消失），读取时回落 env 推导（AC6）；本页无迁移提示 UI（静默迁移） |

### 5.3 引擎说明面板文案（右侧 panel「引擎说明」，基线照录）

1. `内核：Claude Code Agent SDK（每次运行 spawn 一个 claude CLI 子进程）`
2. `浏览器工具：进程内 MCP server（creatoros-browser），与外部 MCP 桥同一套工具面。`
3. `会话隔离：子进程的 CLAUDE_CONFIG_DIR 指向应用数据目录，不污染 ~/.claude。`
4. `执行步骤（工具调用/文本流）实时推送到 Agent 面板，聊天与 Cron 共用同一事件流。`

关键词（SDK 名、env 名、server 名）用 `code` 样式（色 `#a9bcff`）。

---

## 6. Automation 页 agent.run 表单

页面结构同其他页：`.content-grid` 双栏 = 左「Create cron job」panel / 右「Jobs」列表 panel。

```
┌ Create cron job panel ──────────────┐  ┌ Jobs panel ─────────────┐
│ [Job name_____________________]    │  │ 每日巡检                │
│ [Cron (e.g. 0 9 * * *)_________]   │  │ 0 9 * * * · agent.run  │
│ [workflowType ▾________________]   │  │ ☑ enabled               │
│   ├ browser.navigate — 定时打开…    │  │─────────────────────────│
│   ├ agent.run — 由 Claude Code…    │  │ Open dashboard          │
│   └ demo — 演示工作流              │  │ 0 9 * * * · browser.navigate│
│ （选 agent.run 时 ↓）              │  │ ☑ enabled               │
│ ┌ Agent prompt，如：打开小红书创作  │  └─────────────────────────┘
│ │ 中心，检查登录状态并汇报        │   │
│ │ （textarea rows=5）            │   │
│ └───────────────────────────┘    │  │
│ [Create]                          │  │
└────────────────────────────────────┘
```

### 6.1 字段定义

| 字段 | 控件 | 定义 |
|---|---|---|
| Job name | `.field` text | placeholder `Job name` |
| Cron | `.field` text | placeholder `Cron (e.g. 0 9 * * *)`（node-cron 五段式） |
| workflowType | `.field` select，三选一 | `browser.navigate — 定时打开指定页面` / `agent.run — 由 Claude Code Agent 执行 prompt（与聊天同一引擎）` / `demo — 演示工作流` |
| Target URL | `.field` text，**仅** `browser.navigate` 时渲染 | placeholder `Target URL` |
| Agent prompt | `.field` **textarea rows=5**，**仅** `agent.run` 时渲染（替换 URL 输入框的位置） | placeholder `Agent prompt，如：打开小红书创作中心，检查登录状态并汇报`；多行；空值后端建 run 时报错（`agent.run job requires payload.prompt`，job_runs 记 failed） |

### 6.2 交互规则

- 下拉切换即切换条件字段（URL 输入框 ↔ prompt 多行输入框），互斥不并存；`demo` 无附加字段。
- Create：`.primary`，提交 `jobs.create({name, cron, workflowType, payload})`，payload 按类型为 `{url}` / `{prompt}` / `{}`。
- Jobs 列表：每条 `.content-item` 显示 name、`cron`（code 样式）· workflowType、enabled checkbox。
- 设计增强（缺口 G9，P3）：`agent.run` 且 prompt 为空时 Create 置灰/提示必填（当前只靠运行时报错）。
- 设计增强（缺口 G10a，P3）：Jobs 列表对 agent.run 类型追加显示 prompt 首行摘要。

---

## 7. 主题约束（UI Gate 铁律）

1. **全部沿用 `app.css` 既有暗色变量**，禁止第二套色值：任何新增视觉必须映射到下表token。

| 语义 | token |
|---|---|
| 应用底 / 侧栏底 | `#0f1115` / `#14171d` |
| 面板底 / 卡片底 | `#181c24` |
| 输入底 | field `#11151c`、textarea `#0f1218`、step-json `#10141b` |
| 边框 | `#242832` `#282e3a` `#303746` `#232a38` |
| 正文 / 次级 | `#eef1f6` `#c6d0e0` `#cfd8e6` |
| muted 系 | `#9aa6b8` `#8993a5` `#7f8999` `#727c8e` `#67718a` `#5b6575` |
| 品牌蓝 | `#7c9cff`（spin/链接）`#6f8cff`（主按钮）`#a9bcff`（code） |
| 成功 | `#5fc98c`（✓、●、ok-msg） |
| 失败 | `#e25b5b`（✗）`#e27373`（err-msg）停止按钮底 `#8a3535` |
| 警告 | `#e2b93b`（⚠，同 logs warn） |
| cron 绿 | banner 底 `#232a1f`、文字 `#b7d99a` |

2. 圆角：面板 14px（`.panel`/`.card`）、字段/按钮 9px、步骤行 7px、气泡 11px——不新增第五档。
3. 新视觉需求（新状态色、新图标色）一律先查上表与 logs-dot 既有色，找得到就不新增 hex。

### 7.1 v0.3 新增 CSS 类清单（已在 app.css 落地，逐个设计意图）

| 类 | 定义摘要 | 设计意图 |
|---|---|---|
| `.step-group` | margin 6px 0 | 一次 run 的步骤流容器，与前后气泡拉开呼吸间距 |
| `.step` | flex / 12px / `#9aa6b8` / 圆角 7px / hover `#1a1f29` / wrap | 步骤行基类：低调次级信息，hover 提示可点 |
| `.step.open` | 底 `#1a1f29` | 展开态与 hover 同色，视觉连续 |
| `.step-icon` | 宽 16px 居中 | 图标列定宽，行内对齐 |
| `.step-icon.spin` | 1.2s linear infinite 旋转，色 `#7c9cff` | tool_start 的「机械执行中」标识（类型标识，非实时状态） |
| `@keyframes spin` | rotate 0→360 | 上行动画定义 |
| `.step.result.ok .step-icon` | `#5fc98c` | 工具成功 ✓ 绿 |
| `.step.result.fail .step-icon` | `#e25b5b` | 工具失败 ✗ 红 |
| `.step.done .step-icon` | `#5fc98c` | run 完成 ● 绿 |
| `.step.error .step-icon` | `#e2b93b` | run 出错 ⚠ 黄（与 logs warn 同色，全仓统一的告警语义） |
| `.step-label` | ui-monospace 11.5px `#c6d0e0` | 工具名是「机器操作」，用等宽字体区分于人话文本 |
| `.step-hint` | 11px `#67718a` | 「展开/收起/详情」弱提示，不与正文抢注意力 |
| `.step-time` | margin-left:auto，10.5px `#5b6575` | 时间/耗时/指标靠右对齐，形成可扫描的右侧数据列 |
| `.step-json` | 底 `#10141b`、边框 `#232a38`、圆角 7px、max-height 200px、break-all | 展开的 input/detail 原文；限高防长 JSON 撑爆面板，break-all 防无空格长串溢出 |
| `.bubble.pending` | opacity .75 | 运行中 assistant 气泡的「未定稿」态 |
| `.bubble.assistant.inline` | 透明底、margin-left 18px、`#cfd8e6` | 步骤流内 text 打字机文本：与最终气泡区分（无底色=中间产物） |
| `.composer-actions` | flex space-between | 左会话标签、右操作按钮的一行布局 |
| `.composer-actions .small` | 11px | 会话标签弱化字号 |
| `.composer-actions button.stop` | 底 `#8a3535`、白字、圆角 9px | 停止按钮用暗红，与蓝色发送按钮形成「破坏性 vs 常规」对比，沿用主按钮尺寸 |
| `.cron-banner` | padding 7px 15px、底 `#232a1f`、字 `#b7d99a`、底边框 `#242832` | cron 运行条：绿色系（自动化/后台语义）区别于聊天的品牌蓝，高度压缩不挤占 chat |
| `.test-detail` | 底 `#11151c`、圆角 8px、break-all、11.5px | Test connection 原始回包/错误摘要块，等宽可读 |

复用的既有类（不重定义）：`.field` `.primary` `.panel` `.content-grid` `.content-item` `.muted` `.ok-msg` `.err-msg` `.bubble(.user/.assistant)` `.composer` `.chat` `.row`。

---

## 8. 实现缺口清单（设计基线 vs 当前代码 → R2/R3 输入）

> 静态审查 `AgentPanel.tsx` / `registerIpc.ts` / `Scheduler.ts` / `stepTranslator.ts` / `e2e/helpers.ts` 得出。优先级：P0 阻塞验收标准，P1 设计要求未达，P2 体验/健壮性，P3 可选增强。

| # | 优先级 | 缺口 | 设计要求 | 关联 AC |
|---|---|---|---|---|
| G1 | P0 | cron 步骤不达 renderer、cronBanner 永不出现：`AgentStep` 无 `source` 字段；Scheduler 的 `onStep` 只写日志，未接 `pushStep` 广播 | AgentStep 增加 `source`；Scheduler 复用同一 `pushStep`；banner 依 source 显示、依 runId 清除（§4） | AC8 |
| G2 | P0 | 最终文本可能渲染 3 份：step-group 的 inline 气泡 + `onAgentDone` 追加的 assistant 气泡 + `send()` resolve 后再追加的 assistant 气泡（事件先于 invoke resolve 到达时必然重复） | 一次 run 的最终文本**只出现一次**：done 后移除/收敛 inline 气泡，assistant 气泡只由一处逻辑追加 | AC1 |
| G3 | P1 | text delta 打字机覆盖语义未实现：所有 text 步骤 `join('')`，delta 模式下重复显示 | delta 追加缓冲、全文到达整段替换（§2.3） | AC2 |
| G4 | P1 | tool_result 行不显示工具耗时：`toolTimes` 已在主进程采集但未下发/未渲染 | 行右侧显示 `X.Xs` 耗时（§2.2） | AC1 |
| G5 | P1 | error 行不可展开、错误摘要（detail JSON）不可见 | error 行同 tool_result 可点击展开 detail（§2.5） | AC1 |
| G6 | P1 | 停止/异常路径无终止状态行：interrupt+abort 后无 error/interrupted 行，仅 busy 解除；`registerIpc` catch 推送的 runId 是 `'unknown'`，onAgentDone 匹配不上 | 中断或异常时步骤流补一行终止态（`⚠ 已中断` 或 error 行带原因） | AC3 |
| G7 | P1 | cron-banner 出现时破坏布局：`.agent` 的 `grid-template-rows:55px 1fr auto` 只有 3 行，banner 作为第 4 子元素会占掉 `1fr`，chat 拿到 auto 行失去限高滚动 | 行模板改为 `55px auto 1fr auto`（无 banner 时 auto 行塌缩为 0，两种情况都正确） | AC8 |
| G8 | P2 | tool_start 的 ⚙ 恒旋转，run 结束后仍暗示「进行中」 | run 终态后冻结动画（如 `.step-group.done .step-icon.spin{animation:none}`），不改类型标识语义 | — |
| G9 | P2 | fake 模式步骤瞬时完成，busy 态/停止按钮/中断 E2E 无法在中间态截获 | fake 回放支持 `CREATOROS_FAKE_STEP_DELAY_MS` 逐步延时（也服务 §9 截图 S3/S4） | AC3、AC10 |
| G10 | P2 | `e2e/helpers.ts` 仍注入 `CREATOROS_AGENT_PROVIDER='mock'` 且未注入 `CREATOROS_FAKE_CLAUDE=1` | helpers 改注 `CREATOROS_FAKE_CLAUDE=1`，旧 env 清零（视觉验收与 E2E 都依赖 fake 模式） | AC10、AC11 |
| G11 | P3 | 停止按钮从 items 反查 runId，取「最后一个 steps/assistant」 | busy 时记录本面板 activeRunId state，stop 精确作用于它 | AC3 |
| G12 | P3 | Automation 页 agent.run 空 prompt 前端不校验；Jobs 列表不显示 prompt 摘要 | Create 前端必填校验 + 列表 prompt 首行摘要（§6.2） | AC8 |

---

## 9. 视觉验收方式（UI Gate，按 WORKFLOW_CN §2 / §8）

原则：**图片类输入统一路由 fuyao-coding 内核**——由它对本设计线框与实现截图做对比，输出差异清单；差异修复用默认内核，修复后二次对图直到通过。

### 9.1 截图准备（确定性、离线）

- 启动：`CREATOROS_FAKE_CLAUDE=1 npm run dev`（或临时 e2e 截图脚本），无外网依赖；主窗口视口 1440×900。
- 依赖 G9 的步骤延时时，注入 `CREATOROS_FAKE_STEP_DELAY_MS=400` 保证中间态可截。

| 编号 | 截图内容 | 对比线框 |
|---|---|---|
| S1 | Agent 面板空数据态（首次打开） | §3.4 |
| S2 | fake run 完成态：user 气泡 + ⚙/✓/● 步骤行（含一处展开的 step-json）+ assistant 气泡 | §1、§2 |
| S3 | 运行中态：header「运行中…」+ 停止按钮 + ⚙ 旋转行 | §3.1 |
| S4 | 出错态：✗ 行 + ⚠ error 行（展开错误详情） | §2.5、§3.3 |
| S5 | Settings 页：四字段 + Save 成功 ok-msg + Test connection ✓ 结果（detail `fake mode`） | §5 |
| S6 | Automation 页：workflowType 选 agent.run、prompt textarea 可见 | §6 |
| S7 | 视口 1024px（面板 280px 断点）任一 Agent 态 | §1.1 |
| S8 | cron 触发态：cron-banner 出现（G1 修复后补截） | §4 |

截图建议存 `docs/shots/v0.3/`（进 git 供追溯），VERIFICATION.md 引用路径。

### 9.2 对图流程

1. **输入**：每张截图 + 对应线框节（§1/§2/§5/§6）+ §7 色值表交给 fuyao-coding，逐项核对：布局结构（区域顺序/栅格）、元素存在性（每类步骤行/按钮/标签）、颜色（比对 §7 token，重点：✓ 绿 `#5fc98c`、✗ 红 `#e25b5b`、⚠ 黄 `#e2b93b`、spin 蓝、stop 红 `#8a3535`、banner 绿系）、间距圆角（14/11/9/7px 档位）、状态可见性（busy/空闲/出错/空态/banner）。
2. **输出**：fuyao-coding 差异清单，逐条标注严重级（P0 缺状态或错色板 / P1 结构偏差 / P2 间距微差 / P3 主观建议）。
3. **判定**：P0、P1 = 0 方为通过；P2/P3 记录进 backlog 不阻塞。
4. **回环**：差异清单作为 R3 输入逐条修复（默认内核），修复后**同一编号截图重拍、二次对图**，直到 P0/P1 清零。
5. **主题核对**（配合对图）：对 app.css 的本次 diff 提取新增 hex 值，与 §7 色值表白名单比对——出现表外 hex 即打回（UI Gate：不得引入第二套数值）。
6. **存档**：`docs/VERIFICATION.md` 追加「v0.3 UI 对图」小节：fuyao-coding 结论原文、差异清单、修复回环记录、截图路径；满足 WORKFLOW §6 Definition of Done 第 3 条（UI 改动过视觉对比，结论存档）。

---

## 10. R1 完成自检（停止线核对）

| WORKFLOW §2 停止线 | 本文档回答 |
|---|---|
| 每个页面/状态有对应 UI 定义 | AgentPanel（§1–§4）、SettingsPage（§5）、AutomationPage（§6）全覆盖 |
| 交互状态三问（空数据/出错/加载中） | §3.4 空数据、§3.3 出错、§3.1 运行中（加载中）；Settings 的加载/空/错在 §5.2 |
| 暗色主题变量不得引入第二套数值 | §7 铁律 + 全类清单映射既有 token |
| UI 验收门（截图对比，fuyao-coding 结论存档） | §9 流程 + 判定标准 + 存档位置 |
| 差异清单作为 R3 输入 | §8 缺口清单 G1–G12（含 P0 两项）移交 R2/R3 |
