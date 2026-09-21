# v0.3 R4 测试报告 — Claude Code Agent 内核 + 步骤流式展示

> 阶段：R4 测试产物（对应 `docs/WORKFLOW_CN.md` §5 双层测试）。
> 需求基线：`docs/specs/agent-claude-code.md`（R0，AC1–AC13）。
> 实现基线：`docs/specs/agent-claude-code-dev-report.md`（R3）；架构基线 `docs/specs/agent-claude-code-arch.md`（R2）。
> 状态：**双层全绿** — vitest 6 文件 43 用例、playwright e2e 5 spec 27 用例，`npm run gate`（lint → 4×typecheck → build → vitest → e2e）退出码 0。

---

## 0. 结果摘要

| 门禁 | 结果 |
|---|---|
| `npm run lint` | 0 error / 36 warning（全部为 R3 既有 `no-explicit-any` 形态，新测试文件 0 warning） |
| `npm run typecheck`（4×） | PASS（renderer / main+preload / e2e / test） |
| `npm run build` | PASS（vite + main tsc + tools tsc） |
| `npm run test`（vitest） | **6 files / 43 tests passed**（~0.8s） |
| `npm run test:e2e`（playwright） | **27 passed**（~10–15s，全离线：fake 模式 + fixture 127.0.0.1:17992） |
| `npm run gate` | **全绿（exit 0）**；全套 e2e 连续 3 轮 27/27，settings.spec 压力复跑 10 轮 60/60 |
| AC11 残留检索 | `grep -rn "CREATOROS_AGENT_PROVIDER|compatBaseUrl|AGENT_CHAT|EVENT_AGENT_TOKEN|anthropicKey" src e2e tests scripts .env.example` 零输出 |

R4 过程中经 e2e 驱动修复了两处 R3 实现缺陷（详见 §3 修复清单）：步骤流 `source` 字段未 enrich、Gateway 400 校验实际返回 HTTP 200。这两条都是「测试先行发现问题」的直接产物。另发现一处 playwright/darwin 环境级坑（`electronApp.close()` 偶发挂死），已在测试侧以有界 close 解决并记录进 VERIFICATION.md。

---

## 1. AC1–AC13 → 测试用例映射表

| AC | 内容 | vitest 覆盖 | e2e 覆盖 | 手动/留验证 |
|---|---|---|---|---|
| **AC1** 聊天步骤流实时展示（四类步骤正确到达 renderer） | — | `fake-script.test.ts`：脚本经真实 translator 产出 ≥4 步、顺序 `tool_start→tool_result→text→done`、seq 严格单调、durationMs 配对 | `agent.spec.ts`：① `agent.run` 即返 `{runId}`（<240ms，早于 fake 4×60ms 步延时）；② onAgentStep 序列断言类型顺序/runId 一致/seq 单调/tool 名 `mcp__creatoros-browser__browser_navigate`/tool_result 带 durationMs 且 ok:true/done detail JSON；source='chat' | UI「每步到达立即新增一行」的视觉流式感未做逐帧断言（事件驱动渲染已由②隐式覆盖）；真机手测截图归 R5 |
| **AC2** 文本 delta 打字机 | ✅ | `claude-agent-step.test.ts`：`stream_event.text_delta → {type:'text', isDelta:true, msgUuid}`；assistant 全文带 msgUuid；无 uuid 退化 undefined | （delta 翻译层离线断言已足够；fake 脚本不含 delta 消息，UI 聚合逻辑见 AC1②的 text 步骤断言） | 真实 SDK `includePartialMessages` 的打字机视觉体验（手测） |
| **AC3** 停止按钮中断 | ✅ | `run-registry.test.ts`（7 例）：stop 双段式 interrupt→abort 调用顺序、未知 runId false、unregister 后 false、interrupt 抛错仍 abort、二次 stop 不重复调用、多 run 隔离 | `agent.spec.ts` ④：启动即 stop → onAgentDone `ok:false, interrupted:true`；agent_runs 落 `failed` + error 非空 + finished_at 非空（无永久 running）；stop 已结束 runId → false；stop 未知 runId → false | — |
| **AC4** 多轮续聊（resume） | ✅ | `fake-script.test.ts`：`fakeSessionId` resume 透传（echo resumeSessionId）/null 回落 `fake-session-<runId>`；脚本内 4 处 session_id 一致 | `agent.spec.ts` ⑤：第二轮传第一轮 sessionId → 正常完成、两行 agent_runs `session_id` 相同；面板「会话已续接」文案由 sessionId state 驱动（settings UI 用例已验 UI 渲染路径可用） | 真实 SDK 的上下文延续语义（fake 仅断言参数透传） |
| **AC5** Settings 引擎配置热生效 | ✅ | `settings.test.ts`：roundtrip/upsert/env 回落（既有 5 例保留） | `settings.spec.ts`：默认空配置；set roundtrip（baseUrl/authToken/model）+ SQLite `key='agent-engine'` 行纯 JSON；二次 set 覆盖不残留旧键；**重启同 userData 配置仍在**（in-test 关闭再拉起）；Settings 页 UI 保存即生效提示 | 真实网关下「下一次 run 用新配置」的端到端效果（fake 模式无 SDK spawn，`Agent run started` 日志 meta 的 baseUrl/model 读取点已在 main 侧由 e2e 日志用例覆盖 runId 维度） |
| **AC6** v0.2 旧配置行迁移 | ✅ | `settings.test.ts`：注入 `{"provider":"anthropic"}` 行 → get 返回 env 形态且无 provider 键；损坏 JSON 回落 env | `settings.spec.ts`：默认配置断言 `not.toHaveProperty('provider')`；roundtrip 后落库值无 provider | — |
| **AC7** Test connection | 部分 | —（fake 分支在 service 内，不进 vitest——Electron 依赖归层规则） | `settings.spec.ts`：`settings.testProvider()` fake 返回 `{ok:true, detail:'fake mode'}`；Settings 页 UI 点 Test connection 显示「✓ 引擎连通」 | **真实网关连通性**（30s 超时对网关发最短 prompt）——门禁不依赖外网，留人工验证 |
| **AC8** cron `agent.run` 与聊天共用引擎 | ✅ | （Scheduler/Gateway 属 Electron 链路，归 e2e；payload 校验后端兜底由 e2e ③覆盖） | `cron-agent.spec.ts`：① `POST /api/jobs` 合法 payload → **201** + job 可见于 state；③ 无效 payload（缺 prompt/空白 prompt/坏 cron/未知 workflowType/缺 name）→ **400** 且不落 job；② `POST /api/jobs/:id/run` → renderer 收到同一条事件流的步骤（**每步 source='cron:<jobName>'**）与 done；agent_runs 落行（input_json 含 prompt+source）；job_runs 落 `success`、output_json 含 text/steps/sessionId | 到点自动触发（cron 时间驱动）——手动触发端点已覆盖同一 Scheduler.run 路径，定时面留手测 |
| **AC9** `agent_runs` 审计记录 | ✅ | （落库属 Electron 链路，归 e2e） | `agent.spec.ts` ③：成功 run 行全字段断言（provider='claude-code'/status/input_json(prompt+source)/output_json(text/steps/sessionId)/session_id/steps_json（4 步类型序列）/finished_at/error=null）；④ 中断 run 落 failed + error 非空 | — |
| **AC10** E2E fake 模式全离线 | ✅（即本条所述全部 e2e 本身） | `fake-script.test.ts` 纯函数无网络 | 全部 27 例：`launchApp()` 注入 `CREATOROS_FAKE_CLAUDE='1'`，fake 路径不 spawn SDK 子进程；fixture 页 127.0.0.1:17992；本轮在断网 shell 环境变量（ANTHROPIC_*）存在下仍全绿（helpers 显式清洗，见 §3） | — |
| **AC11** 旧 provider 代码移除干净 | ✅ | 重写后的 agent/settings/cron spec 编译期保证不再引用 `agent.chat`/`provider`/`compatBaseUrl` | 同左（typecheck 4× 全过即闭包）+ R3 自检 grep 零输出（R4 复核） | — |
| **AC12** 步骤流 IPC 四处同步 | ✅ | typecheck 4× 全过（`shared/ipc.ts`/`preload.cts`/`registerIpc`/`global.d.ts` 四处一致才可编译） | 所有 e2e 经 `window.creatorOS.agent.run/stop`、`onAgentStep/onAgentDone` 真实调用即隐式验证（agent.spec 全部 6 例 + cron 3 例） | — |
| **AC13** agent 日志可追溯 | ✅ | `logger.test.ts`（既有 5 例：ring/child/level 过滤等） | `agent.spec.ts` ⑥：`logs.list({module:'agent'})` 断言 `Agent run started`（meta.runId+source）与 `Agent run finished`（meta.runId）；`level:'debug'` 过滤出该 runId 的 `Agent step` 行 ≥4；`cron-agent.spec.ts` ②：gateway `GET /api/logs?module=agent` 断言 cron run 的 started/finished + 每步 debug 打点 | — |

**覆盖率小结**：13 条 AC 中 **12 条有自动化测试覆盖**（vitest 与/或 e2e），其中 10 条完全由自动化闭环（AC1/2/3/4/6/9/10/11/12/13）；AC5/AC8 的自动化覆盖了离线可测面、各留 1 个真实网关/定时触发的手动验证点；**仅 AC7 的真实连通性与 AC2 的真实打字机、AC4 的真实会话延续、AC8 的到点触发属人工验证项**（均为「真实网关/真实 SDK」面，fake 模式按设计不覆盖，门禁不依赖外网）。

---

## 2. 测试清单（双层）

### 2.1 vitest（6 文件 43 用例，`npm run test` ~0.8s）

| 文件 | 用例数 | 内容 |
|---|---|---|
| `tests/logger.test.ts` | 5 | （v0.2 既有，保留）ring 容量/child 模块标签/level-search-since 过滤/LOG_LEVEL=debug/文件落盘+clear |
| `tests/claude-agent-step.test.ts` | 11 | stepTranslator：text 带 msgUuid（有/无 uuid）、tool_use→tool_start 序列化输入、tool_result 名称配对+ok 标志、**durationMs 注入时钟断言 + 孤儿配对省略**、失败 tool_result ok:false、delta 带 msgUuid + block_start 早信号 + 后配对、result success→done（cost/durationMs detail JSON）/error 子类型、**success+is_error:true → error 步骤（G5 修正）**、未知消息→[] + seq 单调、extractSessionId |
| `tests/settings.test.ts` | 5 | SettingsStore：roundtrip/upsert 覆盖/ **v0.2 provider 行迁移回落 env** /缺行与损坏 JSON 回落 env/env 四变量映射（含 `clearEngineEnv()` 环境封闭） |
| `tests/step-bus.test.ts` | 5（新） | 空总线 size/subscribe-unsubscribe；fan-out 全订阅者收到同一事件对象；**抛错订阅者被吞掉不影响其他订阅者**（吞后继续可用）；退订后不再收 + 二次退订幂等；零订阅者 publish no-op |
| `tests/run-registry.test.ts` | 7（新） | register/has/unregister；**stop 双段式 interrupt→abort 顺序断言**；未知 runId → false；unregister 后 stop → false 且不打断点；**interrupt 抛错仍 abort**；run 结束后二次 stop false（不重复中断）；多 runId 隔离 |
| `tests/fake-script.test.ts` | 10（新） | fakeSessionId 默认/透传/null；buildFakeScript 4 消息序列形状（assistant→user→assistant→result）、browser_navigate 工具名+url、result success 语义+prompt 回显、resume 透传到全部 session_id、assistant uuid 唯一；**脚本经真实 translator 产出 ≥4 步且顺序/单调 seq/同一 runId**、tool_result ok+detail+durationMs、done detail cost/duration、text 步 msgUuid |

### 2.2 playwright e2e（5 spec 27 用例，`npm run test:e2e` ~10.5s，全离线）

| spec | 用例数 | 内容 |
|---|---|---|
| `e2e/launch.spec.ts`（保留） | 4 | gateway /health、seeded state、401 未授权、preload bridge + 挂载 |
| `e2e/browser.spec.ts`（保留） | 3 | fixture 页 snapshot→click→fill 全链路、scroll、tabs |
| `e2e/logs.spec.ts`（保留） | 5 | 启动模块日志、navigate→browser 日志 meta、模块/level 过滤、IPC logs:list |
| `e2e/agent.spec.ts`（重写） | 6 | ① `agent.run` 即返 `{runId}`；② 步骤流序列/runId/seq/tool 名/durationMs/source='chat'；③ done `ok:true` + `fake-session-` 前缀 + agent_runs 成功行全字段；④ 中断：done `ok:false, interrupted:true` + agent_runs failed + stop 语义（已知/未知 runId）；⑤ 续聊 resume 两行 session_id 一致；⑥ agent 日志 started/finished + 每步 debug 打点（LOG_LEVEL=debug 注入） |
| `e2e/settings.spec.ts`（重写） | 6 | ① 默认空配置无 provider 键；② set roundtrip + SQLite `agent-engine` 行；③ 二次 set 覆盖（热重读面）；④ **重启同 userData 配置持久**（in-test 重启，重启用例置于文件末尾并将新实例移交 afterAll；所有 close 走 `closeApp()` 带 SIGKILL 兜底）；⑤ testProvider fake `{ok:true,'fake mode'}`；⑥ Settings 页 UI：evaluate 驱动表单（React 受控输入）→ 保存「已保存并立即生效」+ Test connection「✓ 引擎连通」+ get 回读 |
| `e2e/cron-agent.spec.ts`（新） | 3 | ① `POST /api/jobs` 合法 agent.run payload → 201 + state 可见；② 五种无效 payload（缺 prompt/空白 prompt/坏 cron/未知 workflowType/缺 name）→ 400 且不落库；③ `POST /api/jobs/:id/run`：同事件流步骤（每步 source='cron:\<name\>'）+ done、agent_runs/job_runs 双表落行、output_json 三字段、gateway 日志端点可见 started/finished/每步打点 |

**e2e 环境前提**（helpers.ts）：`CREATOROS_FAKE_CLAUDE='1'`、gateway 17991 + token `e2e-token`、临时 userData、**清洗宿主 shell 的 ANTHROPIC_* 环境变量**（本机跑 Claude Code 的 shell 会导出这些变量，泄漏进 `engineConfigFromEnv()` 会让「默认空配置」断言失真——与 R3 在 vitest 侧发现的是同一类问题，见 dev-report §1.10）；`LOG_LEVEL=debug` 按需注入（agent/cron spec）以暴露 `Agent step` debug 打点。

---

## 3. R4 期间修复的实现缺陷（e2e 驱动）

测试先行暴露了两处 R3 实现问题，均已修复并回归：

| # | 缺陷 | 现象（失败用例） | 修复 |
|---|---|---|---|
| 1 | **步骤流 `source` 字段从未 enrich**（arch §2.2 要求 service 在 publish 前补 `step.source = source`，R3 漏了这一行） | cron-agent ②：每步 `source` 为 undefined → cron banner 在 renderer 永远不显示（G1 静默回归） | `src/main/agent/claudeAgent.ts` `emitStep()` 首行 `step.source = source`。chat/cron/合成终止步骤统一经过此处 |
| 2 | **Gateway 400 校验实际返回 HTTP 200**（`reply400()` 只构造了 `{status:400,error}` 的 JSON body，Fastify 默认 200） | cron-agent ②：无效 payload 期望 400 实收 200，且**坏 job 已落库** | `src/main/gateway/Gateway.ts`：`badRequest(reply, msg)` 用 `reply.code(400).send({error:msg})`；顺带按工作项要求给 `POST /api/jobs` 成功路径补 `reply.code(201)`（资源创建语义，原为 200） |

测试侧修正（非实现缺陷）：

- agent.spec「即返」用例最初不等待自身 run 结束，后续用例的收集器收到跨用例步骤（VERIFICATION.md 自足铁律的具体化）；
- cron-agent 的日志断言最初依赖前序用例的 run（worker 重启后失配），已并入触发用例自足化；
- helpers `launchApp()` 清洗宿主 shell 的 `ANTHROPIC_*` 环境变量（本机跑 Claude Code 的 shell 会导出这些变量，泄漏进 `engineConfigFromEnv()` 使「默认空配置」断言失真——与 R3 在 vitest 侧发现的是同一类问题，dev-report §1.10）；
- **darwin 下 `electronApp.close()` 偶发挂死**（仅出现在 playwright runner 内；独立 node 脚本对同一 app 反复 close→relaunch 从不挂）：压力复跑（settings.spec --repeat-each=10）暴露，每轮 60s 卡死。修复为 `closeApp()`——`close()` 与 5s 定时器 race，超时则 `process().kill('SIGKILL')`；对持久化断言安全（`settings.set` 同步提交 SQLite/WAL）。修复后 settings.spec 连续 10 轮全过（60/60），全套 e2e 连续 3 轮 27/27。详见 VERIFICATION.md「v0.3 R4」小节。

---

## 4. 遗留（移交 R5/后续）

1. **AC5 真实热生效的最后一公里**：fake 模式不 spawn SDK，「save 后下一次 run 使用新 env」只能由 `Agent run started` 日志 meta（baseUrl/model）间接佐证——`logs.list` 用例已断言该打点存在；对真实网关的端到端验证（改 baseUrl → run 真走新网关）留人工，或在接入真实网关的联调环境补一条 spec（范围外）。
2. **AC7 真实连通性**：`testConnection` 的真实分支（30s 超时、真实 prompt）无离线测试面；建议在公司网关可达的联调机上跑一次 Settings → Test connection 手测并截图归档（R5）。
3. **UI 流式逐帧行为**：AC1「面板在每步到达时立即新增一行」目前由事件驱动渲染结构性保证（步骤到达即 setItems）+ e2e 步骤序列断言，未做「行数随事件增长」的轮询断言——fake 默认步延时 60ms 已使该断言可行，如 R5 需要可在 agent.spec 增补（用 `CREATOROS_FAKE_STEP_DELAY_MS` 显式放大步延时可做视觉级验证）。
4. **steps_json 的 256KB 截断分支**（`compactStepsJson` 丢中间段）未覆盖：需要构造 >256KB 步骤序列的 run，fake 脚本不产生该量级数据；建议后续以 vitest 直测 `compactStepsJson`（需先把它从 claudeAgent.ts 抽出为纯函数——arch §1.7 归层规则的延伸，非 v0.3 阻塞项）。
5. **`db:generate` 迁移记录**（R3 遗留 #1 原样移交）：drizzle-kit 版本兼容问题未解，建表仍靠 `db/index.ts` 幂等 SQL；R4 的 e2e 已验证老库升级路径（agent_runs 4 新列）写入正常，不新增风险。
6. **lint 36 warning**：全部为 R3 既有 `no-explicit-any`/preload 形态（warn 级、非门禁项），新测试文件零新增。

---

## 5. 复现

```
npm run build        # electron 加载 dist 产物，e2e 前必须
npm run test         # vitest  6 files / 43 tests
npm run test:e2e     # playwright 27 tests（playwright webServer 自动拉起 fixture）
npm run gate         # lint + 4×typecheck + build + vitest + e2e（全绿 exit 0）
```
