# v0.3 R3 开发报告 — Claude Code Agent 内核 + 步骤流式展示

> 阶段：R3 开发实现产物（对应 `docs/WORKFLOW_CN.md` §3）。
> 方案基线：`docs/specs/agent-claude-code-arch.md`（R2）。
> 需求基线：`docs/specs/agent-claude-code.md`（R0，AC1–AC13）；UI 基线 `docs/specs/agent-claude-code-ui.md`（R1，G1–G12）。
> 状态：**实现完成，快速门禁全绿**（lint 0 error / typecheck 4× 全过 / vitest 21 过 / build 过）。

---

## 0. 结果摘要

按 R2 方案逐项落地了三个收敛（StepBus 事件总线、finalize 单收口、RunItem 单一数据模型）与 G1–G12 修补。所有改动均按方案文件清单（arch §1.1）落在既定层；未动 `scripts/mcp-stdio.ts`（外部桥保留）、未动 `tests/`（仅按允许范围同步了 stepTranslator 新字段断言与 settings 环境封闭修正）、未动 `src/main/services/settings.ts`（迁移语义已复核为符合方案 §1.3）。

快速门禁输出：

```
npm run lint                                     # 0 error, 36 warning（warn 不计；9 条来自 stepTranslator 既有 Record<string,any> 模式，其余为 preload/global.d.ts 既有形态）
npx tsc -p tsconfig.main.json --noEmit           # PASS
npx tsc -p tsconfig.json --noEmit                 # PASS
npx tsc -p tsconfig.e2e.json --noEmit            # PASS（npm run typecheck 4× 全过）
npx tsc -p tsconfig.test.json --noEmit           # PASS
npm run test                                      # 3 files / 21 tests passed
npm run build                                     # vite build + main/tools tsc PASS
```

AC11 残留检索（R3 自检）：

```
grep -rn "CREATOROS_AGENT_PROVIDER|compatBaseUrl|AGENT_CHAT|EVENT_AGENT_TOKEN" src e2e tests scripts .env.example
# 零输出（settings.ts 迁移分支内的 'provider' 兼容读取为方案豁免项）
```

---

## 1. 方案项 → 完成状态 → 涉及文件

### 1.1 新增模块（arch §1.1 #3/#4/#5）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| #3 StepBus（publish/subscribe/size，fan-out 吞异常） | ✅ 完成 | `src/main/agent/stepBus.ts` | 按方案签名实现；push-only 无缓冲；订阅者抛错打 warn 并吞掉（`agent-bus` child logger），不影响其他订阅者。`size` 为 getter。 |
| #4 RunRegistry（Map runId→{interrupt,abort}，无 Electron 依赖） | ✅ 完成 | `src/main/agent/runRegistry.ts` | register/unregister/stop/has；stop 双段式（先 interrupt 后 abort，interrupt 异常吞掉）；未知 runId 与已 unregister 的 runId 均返回 false。 |
| #5 fakeScript 纯函数（脚本抽出 + resume 透传） | ✅ 完成 | `src/main/agent/fakeScript.ts` | `buildFakeScript(opts)` 产出 4 条消息序列（tool_use→tool_result→assistant text→result）；消息 shape 按 SDK 0.3.278 `sdk.d.ts` 固定（assistant 带顶层 uuid/session_id）；`fakeSessionId(opts)` = `resumeSessionId ?? fake-session-${runId}`——resume 透传使 AC4 可断言两行 session_id 关系。 |

### 1.2 类型与 IPC（arch §1.1 #1/#2、§2.5、§1.2 四处同步）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| AgentStep 增 `source?/msgUuid?/durationMs?` | ✅ 完成 | `src/shared/types.ts` | 与 arch §2.5 完全一致。 |
| AgentRunResult 增 `error?/interrupted?/source?` | ✅ 完成 | `src/shared/types.ts` | 与 arch §2.2 完全一致。 |
| 删 legacy `AGENT_CHAT`/`EVENT_AGENT_TOKEN` | ✅ 完成 | `src/shared/ipc.ts` | 两个常量删除，grep 零命中（AC11）。 |
| IPC 四处同步：`agent:run` 即返 `{runId}` | ✅ 完成 | `src/shared/ipc.ts`（通道不变）、`src/preload/preload.cts`（返回 `Promise<{runId:string}>`）、`src/main/ipc/registerIpc.ts`（handler 即返）、`src/renderer/global.d.ts`（类型更新） | 负载语义变更，通道名不变（arch §1.2 变更表）。 |

### 1.3 ClaudeAgentService 重构（arch §1.1 #6、§2.2、§3.5、§3.7）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| streamRun 签名改为方案版（runId/source/resumeSessionId/onStep 可选） | ✅ 完成 | `src/main/agent/claudeAgent.ts` | `StreamRunOptions` 与 arch §2.2 一致；onStep 为可选直连消费者，bus 始终收到全量。 |
| run 级失败不再 throw，resolve `ok:false` 的 AgentRunResult | ✅ 完成 | 同上 | 正常/中断/异常路径全部走 `finalize()` 后 resolve；`registerIpc` 的 `'unknown'` 兜底 catch 随之删除。 |
| finalize 幂等收口：恰好一次 pushDone | ✅ 完成 | 同上 | `finalized` 守卫吸收「result 已收后又抛 AbortError」竞态（SDK 0.3.278 已核实该竞态真实存在，arch §0.2）；try 正常出口 / catch 出口都调 finalize。 |
| 中断/异常合成终止步骤（G6） | ✅ 完成 | 同上 | run 结束时若无 done/error 步骤，补发 error 步骤：interrupted → `{subtype:'interrupted'}`，异常 → `{subtype:'error', error}`。步骤流总有终止行。 |
| stop 走 RunRegistry，双段式 interrupt→abort | ✅ 完成 | 同上 | `stop(runId)` 委托 `registry.stop`；对未注册 runId 返回 false（AC3）。 |
| stop 对 fake run 生效 | ✅ 完成 | 同上 | runFake 也 `registry.register(runId, {interrupt:()=>{}, abort})`，延时边界检查 `abort.signal.aborted` 中断循环走同一 finalize（interrupted:true）。 |
| fake 模式每步 ~60ms 延时 | ✅ 完成 | 同上 | `CREATOROS_FAKE_STEP_DELAY_MS` env 显式指定时用之，否则默认 60ms；延时用 abort-signal-race 实现（stop 立即解除等待）；保持 4 步脚本语义；interrupted 分支 finalize 返回 `ok:false, interrupted:true, text:'interrupted'`（text 以 done 载荷 `result.text` 为准——此处脚本用 `'interrupted'` 作为 text，见 §3 遗留说明）。 |
| steps 步骤统一 publish 到 bus（service 构造注入） | ✅ 完成 | 同上 + `src/main/main.ts` | 构造器可注入 bus（默认自建）；`initClaudeAgent(kernel, {bus})` 由 main.ts 传入全局 bus。 |
| 内存有界：不再全量 allMsgs | ✅ 完成 | 同上 | 循环中只保留 `sessionId` 与最后一条 result 消息引用（`resultMsg`），全量 allMsgs 数组删除。 |
| steps_json 落库策略（arch §1.3） | ✅ 完成 | 同上 | `compactStepsJson`：非 delta 步骤、单步截断沿用 translator（2000/400）、>256KB 丢中间段并置 `{truncated:true,dropped:N}`。 |
| `permissionMode:'bypassPermissions'` 保留 + canUseTool 预留注释 | ✅ 完成 | 同上 | 保留 bypass + allowedTools 白名单；代码内注释说明工具面扩宽时改用 canUseTool 审批。 |
| 打点表（arch §1.6，文案为 E2E 锚点） | ✅ 完成 | 同上 | `Agent run started`（meta 含 runId/source/resume/baseUrl/model，不打 token）、`Agent step`（debug 级，从 info 降级）、`Agent run finished`/`Agent run failed`/`Agent run interrupted`；文案未改。 |

### 1.4 stepTranslator 扩展（arch §1.1 #7、§2.6、G4/G5）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| TranslateState 增 `pendingToolStart` + 可注入 `now()` | ✅ 完成 | `src/main/agent/stepTranslator.ts` | `newTranslateState(runId, now = Date.now)`；保持纯函数可测。 |
| tool_start 记开始时刻、tool_result 配对算 durationMs | ✅ 完成 | 同上 | assistant tool_use 与 stream_event content_block_start(tool_use) 两条路径都记 `pendingToolStart`；tool_result 消费时配对计算；缺配对时省略字段。 |
| **修 is_error 误译** | ✅ 完成 | 同上 | `subtype==='success' && is_error===true` → error 步骤（detail `{subtype:'success', isError:true, error:<result 文本>}`），不再误译为绿色 done 行（G5 根因修复）。 |
| text 步骤带 msgUuid 透传 | ✅ 完成 | 同上 | assistant text block 与 stream_event text_delta 都带来源消息顶层 `uuid`；无 uuid（fake/旧 shape）为 undefined → renderer 退化为 `'default'` 键（行为兼容 R1）。 |
| 未识别消息 → `[]` | ✅ 保持 | 同上 | 升级回归锚不变。 |

### 1.5 IPC / 转发 / Scheduler（arch §1.1 #9/#10/#11、§3.1）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| AGENT_RUN 立即返回 {runId}，fire streamRun 不 await | ✅ 完成 | `src/main/ipc/registerIpc.ts` | runId 由 handler 生成（nanoid）传入 streamRun；终态只经 EVENT_AGENT_DONE；`.catch` 仅作 service 自身 bug 的保险日志（不再合成 done，runId 已真实）。 |
| pushStep/pushDone 从 StepBus 订阅 | ✅ 完成 | `src/main/main.ts` | main.ts 启动时订阅一次；forwarder 每次取当前 `mainWindow` 并做 `isDestroyed()` 检查——win 重建自动恢复接收、无重复订阅、无闭包失效（G1 根因消除）。 |
| 删除 legacy AGENT_CHAT handler | ✅ 完成 | `src/main/ipc/registerIpc.ts` | 现文件无 AGENT_CHAT（v0.3 首轮已删 handler，本轮删掉 shared 常量后编译期兜底）。 |
| AGENT_STOP 传 runId 给 service.stop | ✅ 完成 | 同上 | 不变，直传。 |
| Scheduler 去掉 onStep 日志广播 | ✅ 完成 | `src/main/scheduler/Scheduler.ts` | `agent.run` 分支只传 `{runId, source:'cron:<jobName>'}`，不传 onStep；逐步 debug 打点由 service 统一负责。 |
| **cron 步骤必须能到达 renderer** | ✅ 完成 | 同上 + main.ts 转发器 | cron run 的步骤与 done 均经同一 bus 转发至 renderer（结构保证，非配置保证）。 |
| Scheduler 按 result.ok 分流 job_runs | ✅ 完成 | 同上 | `if (!result.ok) throw new Error(...)` → job_runs 落 failed；空 prompt 运行期报错路径保留。 |

### 1.6 Gateway 输入校验（arch §1.4）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| POST /api/jobs 后端兜底校验 | ✅ 完成 | `src/main/gateway/Gateway.ts` | name 非空、cron 串（node-cron validate）、workflowType ∈ {browser.navigate, demo, agent.run} 白名单、agent.run 时 prompt 非空；违规返回 400 `{status, error}`。端点形态不变，鉴权沿用全局 Bearer 钩子。 |

### 1.7 AgentPanel 重构（arch §1.1 #17、§2.4，G2/G3/G5/G8/G11）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| Item = `{kind:'user'}` \| RunItem | ✅ 完成 | `src/renderer/components/AgentPanel.tsx` | RunItem 含 runId/source/steps/streamText/status/finalText/expandedSeq/meta，与 arch §2.4 一致；assistant 独立 item 类型删除。 |
| user 气泡由 send() 挂；RunItem 完全由事件驱动 | ✅ 完成 | 同上 | `send()` push user 气泡 + 空 RunItem（以 invoke 返回的 runId 创建，status running）；assistant 内容全部由 RunItem 渲染。 |
| onAgentDone 只改 status/finalText/meta，不追加气泡 | ✅ 完成 | 同上 | 按 runId 找 RunItem 写终态字段；找不到（app 重启后残留事件）忽略。**G2 三重渲染消除**。 |
| delta 聚合按 msgUuid | ✅ 完成 | 同上 | `applyTextStep`：isDelta 追加同 uuid 条目；非 delta 全文整段替换同 uuid 条目；无 uuid 落 `'default'` 键（R1 兼容）；渲染 running 时 join。**G3 消除重复显示**。 |
| stop 从 activeRunId 取（不再反查 items） | ✅ 完成 | 同上 | send() 记 `activeRunId` state；busy = activeRunId 的 RunItem 仍在 running（cron run 不影响 busy）。**G11 结构性消除**。 |
| cronBanner 按 source/runId | ✅ 完成 | 同上 | 派生态：最新一个 `source` 以 `cron:` 开头且 status==='running' 的 RunItem；其 done 到达即随 status 翻转消失（按 runId 清除，不依赖 busyRef）。文案 `⏱ Cron job <jobName> 运行中…`。 |
| tool_result 右侧显示耗时 | ✅ 完成 | 同上 | `Math.round(ms/100)/10 + 's'`（无 durationMs 时回落显示时刻）。**G4**。 |
| error 行可展开 detail | ✅ 完成 | 同上 | error 行加展开交互（detail JSON 进 `.step-json`）；interrupted 的 error 行 label 显示「已中断」。**G5**。 |
| 终态冻结 ⚙ 动画 | ✅ 完成 | 同上 + `src/renderer/styles/app.css` | RunItem 终态时容器加 `done` class；CSS `.step-group.done .step-icon.spin{animation:none}`。**G8**。 |
| `.agent` grid 4 行 | ✅ 完成 | `src/renderer/styles/app.css` | `grid-template-rows: 55px auto 1fr auto`。**G7**。 |
| 无新增 hex | ✅ 完成 | 同上 | 本次 CSS diff 新增的 12 个 hex 全部为 R1 §7.1 已批准清单内的既有 token（step 系/banners 系），无表外色值。 |

### 1.8 Automation 页（arch §1.1 #19，G12）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| agent.run 空 prompt 前端必填校验 | ✅ 完成 | `src/renderer/pages/AutomationPage.tsx` | prompt 空时 Create disabled + muted 提示「agent.run 需要填写 prompt」。 |
| Jobs 列表 prompt 首行摘要 | ✅ 完成 | 同上 | agent.run 项显示 prompt 首行（截 80 字符，`.muted`）。 |

### 1.9 e2e helpers / env（arch §1.1 #20，G10）

| 方案项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| launchApp 删 `CREATOROS_AGENT_PROVIDER`，加 `CREATOROS_FAKE_CLAUDE:'1'` | ✅ 完成 | `e2e/helpers.ts` | 泄漏 env 清零（`ANTHROPIC_MODEL` 本就未注入，经检查 helpers 中不存在）。 |
| `.env.example` 旧 provider 块清理 | ✅ 完成 | `.env.example` | CREATOROS_AGENT_PROVIDER/ANTHROPIC_API_KEY/ANTHROPIC_MODEL/OPENAI_COMPAT_* 全删，换成注释化的 `# ANTHROPIC_BASE_URL=...` 四项（Anthropic 协议网关可选覆盖）。本地 `.env`（git 忽略文件）同步清理。 |
| `e2e/debug-flow.mts` 处置 | ✅ 删除 | — | 一次性 v0.2 调试残留，引用已删除的 `agent.chat`/`provider` API（AC11 grep 范围内），无任何引用方，直接删除。 |

### 1.10 测试同步（允许范围内的最小改动；R4 负责补全）

| 项 | 状态 | 文件 | 说明 |
|---|---|---|---|
| stepTranslator 测试同步新字段 | ✅ 完成 | `tests/claude-agent-step.test.ts` | 既有 8 例全保留；新增/更新：text 步骤带 msgUuid（有/无 uuid 两例）、tool_result durationMs 注入时钟断言 + 孤儿配对省略、success+is_error:true → error 步骤（detail JSON 全字段断言）、delta 带 msgUuid。18→21 例全过。 |
| settings 测试环境封闭修正 | ✅ 完成 | `tests/settings.test.ts` | 加 `clearEngineEnv()` 在 4 个用例前清空 ANTHROPIC_* 环境变量——本机 shell 的 `ANTHROPIC_AUTH_TOKEN` 会泄漏进 `engineConfigFromEnv()` 断言（非 store key 变化；用例语义不变，只是封闭）。 |
| runRegistry / fakeScript / StepBus 单测 | ⏳ 留给 R4 | — | arch §1.7 归层属 R4 范围；R3 已保证三模块无 Electron 依赖、可直测。 |

### 1.11 旧 e2e spec 处置（决策说明）

**选择：删除，不留占位。** `e2e/agent.spec.ts` 与 `e2e/settings.spec.ts` 是 v0.2 provider 时代的残留（引用已删除的 `agent.chat`/`provider`/`compatBaseUrl` API），不删则 `tsconfig.e2e` typecheck 必红。保留"最简化占位"没有信息量——R4 按 arch §5 的用例矩阵整页重写（fake 序列/stop/续聊/双表断言/banner），占位文件反而要再被重写一次。删掉的 4 个用例断言的内容（mock provider 文案、provider 字段）本身已是 v0.2 需求，不属于 v0.3 任何 AC。其余 e2e（browser/logs/launch）不涉及 agent，未动。

---

## 2. 冒烟验证（离线，fake 模式）

在门禁之外，用临时脚本（已删除，未入 git）对真实 app 做了 4 项冒烟，全链路行为确认：

| 验证点 | 结果 |
|---|---|
| `agent.run` 即返 | 8ms 返回 `{runId}` |
| 正常 run | agent_runs 一行 success；steps_json 4 步 `tool_start→tool_result→text→done`；tool_result 带 `durationMs:63`；output_json 含 text/steps/sessionId |
| 中途 stop（250ms 步延时） | stop 返回 true；agent_runs `status:failed, error:'interrupted'`；合成终止步骤 `{"subtype":"interrupted","error":"interrupted"}`；无永久 running 行 |
| 续聊 resume | 两次 run 的 session_id 一致（fake echo resumeSessionId） |
| stop 未知 runId | false |
| testConnection（fake） | `{ok:true, detail:'fake mode'}` |

---

## 3. 遗留问题（移交 R4/后续）

1. **`npm run db:generate` 环境阻塞（非本次改动引入）**：`drizzle-kit@0.31.11` 要求 drizzle-orm compatibilityVersion 10，而仓库锁定的 `drizzle-orm@1.0.0-beta.16` 是 12——drizzle-kit 启动时版本检查直接 `process.exit(1)`，无法生成迁移。实测装 `drizzle-kit@1.0.0-beta.22 + drizzle-orm@1.0.0-rc` 可生成，但那会把整棵依赖树带进 beta/rc，超出 R3 范围，已回退。**运行时不受影响**：建表走 `db/index.ts` 的幂等 SQL（`CREATE TABLE IF NOT EXISTS` + 逐列 `ALTER TABLE`，4 新列已落地，冒烟验证写入正常），`drizzle/0000_initial.sql` 与 schema 的差异仅是迁移记录未再生成。建议：升级 drizzle 全家到稳定版后跑一次 `db:generate` 补迁移记录（R5 或独立小任务）。
2. **fake interrupted 的 text 载荷**：interrupted 分支 finalize 返回 `text:'interrupted'`。方案未规定 interrupted 时 text 的取值（正常路径以 result 文本为准），UI 上 interrupted 时 RunItem 终态气泡会显示 `interrupted` 而非已流出的部分文本。R4 重写 E2E 时若断言此值请对齐。
3. **R4 待补**（arch §1.7 归层，非缺口）：runRegistry/stepBus/fakeScript 的 vitest 用例；agent.spec/settings.spec/automation(cron) E2E 重写；`CREATOROS_FAKE_STEP_DELAY_MS` 中途 stop 的 E2E 固化；UI 对图存档（docs/shots/v0.3）。
4. **tool_start 重复信号**：真实 SDK 流里 `content_block_start(tool_use)` 会比 assistant tool_use 消息先产生一条 tool_start（两处都 push）。这是既有行为（R1 已有「earliest signal」设计注释），fake 脚本只走 assistant 路径不触发。如 R4 的真实 SDK 手测觉得重复行碍眼，可在 translator 用 pendingToolStart 去重——属体验优化，不阻塞 AC。
5. **stepTranslator 的 `Record<string, any>`**：9 条 no-explicit-any warn（规则为 warn 级、既有模式）。SDK 消息是开放 shape，收紧需要逐消息类型化，成本与收益不匹配，维持现状。

---

## 4. AC 对照（R3 视角的实现侧状态）

| AC | 实现侧状态 | 验证侧 |
|---|---|---|
| AC1 步骤流 | fake 4 步经 translator 落库/下发，冒烟确认顺序与 seq | R4 E2E |
| AC2 打字机 | translator delta/全文/msgUuid 分组已实现并有 vitest | vitest 已覆盖翻译层 |
| AC3 停止 | 双段式 stop + finalize + registry，冒烟确认 failed+interrupted | registry 单测留 R4 |
| AC4 续聊 | resumeSessionId 透传 + fake echo，冒烟确认两行 session 关系 | R4 E2E |
| AC5 热生效 | 每次运行重读 getAgentEngineConfig()（无缓存），started 日志 meta 带 baseUrl/model | R4 E2E |
| AC6 旧配置迁移 | settings.ts 未改，vitest 4 例过 | vitest 已覆盖 |
| AC7 Test connection | fake 分支保持，冒烟 `{ok:true,'fake mode'}` | R4 E2E |
| AC8 cron 同引擎 | source 随步骤下发 + bus 转发 + banner 派生态 + Scheduler ok 分流 + Gateway 校验 | R4 E2E |
| AC9 审计落库 | finalize 收口写终态（steps_json/cost/duration/error），中断也落 failed | 冒烟已验证 |
| AC10 离线 | fake 全链路（含延时钩子）无 SDK spawn | 冒烟即离线跑 |
| AC11 旧代码移除 | grep 零命中 + 编译期保证 | 本报告 §0 |
| AC12 IPC 四处同步 | typecheck 4× 全过即闭包 | 本报告 §0 |
| AC13 日志 | 打点表文案未改、meta 含 runId、步骤降 debug | R4 E2E |
