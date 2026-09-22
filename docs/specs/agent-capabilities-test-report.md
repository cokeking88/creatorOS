# Agent 全能力 + 技能系统 R4 测试报告（双层）

- 被测：commit `a4880ed`（R3 批 2：技能页 + chips + 绑定 UI + 外部桥只读四件套）+ 本批 R4 增补
- 规范：`docs/specs/agent-capabilities.md` §7 AC-S1~S10；R2 §13.10 勘误为准（**工具 10 个**，不是 9 个）
- 日期：2026-09-23

## 一、AC-S1~S10 逐条核销对照表

| AC | 断言内容（一句话） | 用例文件 · 用例 | 测试层 |
|---|---|---|---|
| **S1** skills 表 CRUD roundtrip | insert→list→get→update→delete 全字段/时间戳/默认值；DDL 幂等两遍不炸；7 列精确；origin 异常值降级不炸 | `tests/skills-repo.test.ts`（SKILLS_DDL 幂等/列断言、CRUD roundtrip、origin round-trip + alien 降级） | vitest ✅ |
| **S2** 技能页 CRUD + chips | 空态/表单建/编辑改名/两段式删除/绑定计数提示/chips 填入不发送/运行按钮/origin 徽标 | `e2e/skills-page.spec.ts` 8 用例（R3 存量 6 + 本批 2：「运行 button…」「origin=agent…」） | e2e ✅ |
| **S3** skill 绑定 cron 到点执行 | payload `{skillId,prompt:null}` 落库；触发后 agent_runs.prompt===模板、source==='cron:jobName'、job_runs success、steps≥4 | `e2e/skill-cron.spec.ts` test 1（bind…AC-S3） | e2e ✅ |
| **S4** 引用语义三段 | ①改模板→再触发→prompt=新模板 ②删技能→job_runs failed 且 error 含「绑定的技能已被删除」③任务行存活（不级联）+ 自动化页「技能已删除」pill | `e2e/skill-cron.spec.ts` test 2（editing the skill template…）、test 3（deleting the bound skill…） | e2e ✅ |
| **S5** job_create 校验矩阵 | vitest：合法通过（reload/onChange/enabled/nextRunAt）、garbage/6 段拒（标准 5 段提示）、空串 zod 拦、双空/双传/悬空 skillId 拒（附可用技能提示）、空白 prompt 视为缺省；Gateway 400：无 prompt、空白 prompt、坏 cron、悬空 skillId、**双传（本批补）**、**6 段秒（本批补）** | `tests/app-tools.test.ts` job_create 组 + `validateJobInput` 组；`e2e/cron-agent.spec.ts`「invalid job payloads are rejected」 | vitest + e2e ✅ |
| **S6a** 10 工具 handler 直测 | 每工具：zod 校验、repo 调用、写后 onChange、throw 不广播、经路走 scheduler（reload 计数）、requireJob 显式报错、skill_create origin 硬编码 agent | `tests/app-tools.test.ts` 全文件（surface shape 10 工具/读写分面、job_toggle/delete、content_create/update、skill_create、job_list 增强/content_list 过滤/skill_list 全文） | vitest ✅ |
| **S6b** IPC 链路 | renderer evaluate → skills.create → DB 落行（SQLite 直查核对）→ app:state skills 投影同步 | `e2e/skills-page.spec.ts`「form creates a skill…」（state 轮询 + readDb 双断言） | e2e ✅ |
| **S6c** 真工具链路 | 「让 Agent 建技能/建绑定任务」端到端 | — | **手测**（见 §四 复现步骤；fake 盲区） |
| **S7** 围栏与白名单 | allowedTools 双 server 通配 + 文件五件套；DISALLOWED=Bash/NotebookEdit；matcher 结构（7 段字面交替）；HIGH_IMPACT 指向 job_delete；SYSTEM_APPEND 前 5 句保留 + 两条新锚定；server 名 `creatoros-app` 且不撞 browser；DISALLOWED 永不含 mcp__ 前缀（本批补 2 it） | `tests/app-tools.test.ts` agentPolicy constants 组（6 it，R3 4 + 本批 2） | vitest ✅ |
| **S8** 外部桥只读一致性 | 桥注册恰 20 工具（15 browser + job_run + 4 只读）；写/高危全不在（负断言遍历 APP_TOOL_DEFS）；description 逐字；**zod shape 实例同一性（本批补）**；4 GET 转发路径；Gateway 4 GET 端点真形状 + POST-only 边界（**本批新 spec**） | `tests/bridge.test.ts`（8 it，R3 7 + 本批 1）+ `e2e/gateway-quartet.spec.ts`（2 用例，本批新增） | vitest + e2e ✅ |
| **S9** 复合成本可观测 | 多绑定任务连续跑、cost 字段落库、无单 run 超 0.5 | — | **手测**（fake cost=0 无断言价值，`fakeScript.ts:52`） |
| **S10** 全量回归与文档 | gate 全绿 + 文档四处同步 | 本报告 + `docs/SECURITY.md`（#9 重写/#13 新增）+ `docs/MCP.md`（四件套+边界注）+ `docs/DATABASE.md`（skills 表）+ `CHANGELOG.md`（0.5.0 节） | vitest + e2e + docs ✅ |

## 二、本批新增用例清单（R4 增补：4 个新用例 + 2 个新 it + 1 个既有用例内增补组 + 4 处文档同步）

| # | 文件 · 用例 | 一句话意图 |
|---|---|---|
| 1 | `e2e/gateway-quartet.spec.ts` · GET quartet returns the repo-backed shapes（**新文件/新用例**） | 真 app 网关四 GET 端点形状：jobs 含解析后 payload（`{skillId,prompt:null}`）、contents 支持 platform/status 过滤（空过滤忽略）、skills 返 SkillRecord 全字段（含 origin）、accounts 列表——AC-S8 的「gw helper 断端点」面，此前零覆盖 |
| 2 | `e2e/gateway-quartet.spec.ts` · the quartet is read-only: no write route exists（**新用例**） | D5 HTTP 面边界负断言：四个只读路径上 POST 一律 404（写/高危工具没有网关路由可走） |
| 3 | `e2e/skills-page.spec.ts` · 运行 button triggers agent.run（**新用例**） | AC-S2/R1 文案表 #14 的断言锚点：技能页「运行」→ agent.run IPC → toast「已触发运行，到 Agent 面板查看」→ onAgentDone 收到成功终态 → AgentPanel 出现 1 个 RunItem（同一事件驱动机制，无 user 气泡是预期行为） |
| 4 | `e2e/skills-page.spec.ts` · origin=agent skill renders the「Agent 创建」pill（**新用例**） | R1 文案表 #12 徽标断言：fake 造不出 origin='agent'（IPC/工具两侧都硬编码），按 §12.6 测试路径——spec 进程直 UPDATE skills 表（WAL 多进程）+ 一次良性 IPC 写触发 state 广播重绘 → pill.info 文本精确断言（manual 侧无徽标的负断言由既有 form 用例的 `originPill: null` 承担） |
| 5 | `tests/app-tools.test.ts` · APP_MCP_SERVER_NAME is the second SDK server key（**新 it**） | server 名即围栏边界（allowedTools 按 server 前缀通配）：`creatoros-app` 字面值 + 不与 browser server 名互撞 |
| 6 | `tests/app-tools.test.ts` · disallow never covers an app or browser tool（**新 it**） | 防 DISALLOWED_TOOLS 未来回归误加 `mcp__` 前缀项（会静默废掉整个工具面） |
| 7 | `tests/bridge.test.ts` · zod shapes are the SAME instances as APP_TOOL_DEFS（**新 it**） | schema 单源的强断言：桥注册 schema 的每字段 validator 与 APP_TOOL_DEFS 是**同一对象**（`toBe`），手抄重写 schema 的漂移结构性不可逃逸；含 content_list status 枚举行为抽查 |
| 8 | `e2e/cron-agent.spec.ts` · invalid job payloads 组内增补（**既有用例内**） | AC-S5 gateway 面补两态：prompt+skillId **双传** → 400「exactly one」；6 段秒表达式（node-cron 可接受）→ 400「标准 5 段」——D6 取严口径在 Gateway 真实生效 |
| 9 | `tests/app-tools.test.ts` · job_create 组（R3 已立，本批不动） | 引用：合法/非法 cron/互斥三态/悬空 skillId/空白 prompt——AC-S5 vitest 面已全，本批零补 |
| 10 | `docs`（SECURITY #9/#13、MCP、DATABASE、CHANGELOG） | AC-S10 文档同步四个交付物（见 §一 S10 行） |

**没有写的用例（防凑数声明）**：AC-S1/S3/S4/S6a/S6b 核销后缺口为零，本批零重复补写；AC-S5 的 vitest 面（app-tools job_create 组）已覆盖「双空/双传/悬空」三态，本批只补 gateway 面同语义两态（不同校验入口，非重复断言）。

## 三、回归结果（`npm run gate` 全量）

| 阶段 | 结果 |
|---|---|
| ESLint | 0 errors，42 warnings（HEAD 基线 43——本批净 -1：清理了 skills-page 既有 beforeItems 死变量） |
| typecheck ×4 | renderer / main+preload / e2e / tests 全过 |
| build | vite + main tsc + tools tsc 过 |
| vitest | **14 files / 149 tests**（146 存量 + 3 新增，~1s） |
| playwright | **12 specs / 52 tests**（48 存量 + 4 新增，~45s，全离线 fake 模式） |

`npm run gate` 全绿（exit 0）。R4 期间 vitest 全量多轮（含 gate 内跑）、e2e 全量 3 轮（基线 48 → 中间轮 → 终态 52），终态全绿。

## 四、fake 模式盲区（诚实声明）——只能真网关的 AC 与手测复现步骤

fake transport 不 spawn SDK、不调任何 MCP 工具（`claudeAgent.ts:222-224` 直接回放固定 4 步脚本）。因此：

### AC-S6c 真工具链路（手测）

前置：真网关（`CREATOROS_FAKE_CLAUDE` 未设置，引擎已在设置页配好）。

1. **「让 Agent 创建一个技能」→ 技能页出现且带「Agent 创建」徽标**
   - Agent 面板输入：「把『打开创作中心检查登录态并截图』存成一个叫『登录巡检』的技能」
   - 预期：面板步骤流出现 `mcp__creatoros-app__skill_create` 工具行；技能页列表出现「登录巡检」+ `Agent 创建` pill.info；SQLite `SELECT origin FROM skills` 为 `agent`。
2. **「让 Agent 建一个明天 9 点跑某技能的任务」→ 自动化页出现**
   - 输入：「创建一个每天 9 点跑『登录巡检』技能的定时任务，任务名叫巡检」
   - 预期：步骤流 skill_list → job_create；自动化页出现「巡检」行显示「技能：登录巡检」；cron 预览可见下次运行时间（Agent 建的任务与 UI 互认——D6 取严口径的兑现）。
3. **「列出所有定时任务」chips 兑现（R0 §10.5 谎言修复验收）**
   - 空面板点「列出所有定时任务」chip → 发送 → 预期：Agent 调 job_list 并复述任务名/周期/nextRunAt，而不是道歉或瞎编。

### AC-S9 复合成本（手测）

1. 建 2 个绑定技能的 cron 任务（技能页绑定表单或让 Agent 建）。
2. 用 gateway `POST /api/jobs/:id/run` 连续触发两轮（替代等到点，加速观察）。
3. 预期：Dashboard「最近 Agent 运行」每行显示真实 cost（非 fake 的 0）；`SELECT cost_usd FROM agent_runs` 均 ≤ 0.5（maxBudgetUsd 封顶）；两任务 × 两轮的复合成本可在列表逐行核对。任务数无上限是已登记风险（spec §9.4），观察项非门禁。

### 其余 fake 盲区

- 悬空 skillId 的 **job_runs error 摘要 hover**（R1 §12.3 定案降级为固定 title 文案，动态摘要登记 R5）。
- 外部桥真 stdio 往返（`npm run mcp` 手动使用；注册面与转发路径已被 bridge.test + gateway-quartet 双层覆盖，盲区仅在 stdio 传输层）。

## 五、发现并修复的测试问题（本批）

1. **e2e 顺序耦合（skills-page）**：新「运行」用例在 chip 用例之前执行时，AgentPanel 已有 RunItem，chip 用例的「空面板」前提被打破。修复 = 把两个新用例移到 chip 用例之后（chip 用例的空面板前提本就依赖它前面的用例不触发 run——文件内顺序契约，已在用例注释标注）。这暴露了一个既有结构事实：同 spec 内共享一个 app 实例，「面板级」断言必须按序排列；worker 重启安全性不受影响（beforeAll 重跑即新 app，各用例自播种子）。
2. **共享 toast 竞态**：技能页单一 toast 实例，前序用例残留的「已保存技能」toast（3s 生命周期）会被新用例误读。修复 = 点击前先等 `.toast` 清空。
3. **fire-and-forget disabled 断言不可测**：「运行」按钮的 in-flight disabled 态是毫秒级瞬态（IPC resolve 即恢复，设计如此），同步断言必 flaky——撤掉该断言，toast + done + RunItem 三个稳定锚点足够。
4. **lint 净减**：顺带清掉 skills-page 既有 `beforeItems` 死变量（43→42 warnings）。

## 六、遗留（不阻塞 gate）

- AC-S6c/S9 手测项待真网关执行（§四 已列步骤）；门禁不依赖。
- Dashboard 累计成本视角/任务数上限（spec §9.4）为 R5 观察项。
- 真工具链路的自动化长线方案（录制回放）超本需求范围，spec §9.1 已登记。
