# CreatorOS 项目研发工作流规范

> 适用范围：CreatorOS 仓库的所有研发工作。单人开发时角色合并，流程步骤不省略——每个阶段的自检产物就是下一个阶段的输入。
> 版本：v1.0（2026-09-21）

---

## 0. 总览

```
需求（PRD）→ UI 设计 → 架构设计 → 开发 → 测试 → 门禁 → 发布
   R0           R1          R2         R3      R4      G       R5
```

| 阶段 | 产出物 | 停止线（不满足不进下一阶段） |
|---|---|---|
| R0 需求 | `docs/specs/<feature>.md`：背景/用户故事/验收标准 | 验收标准可测试、无歧义词 |
| R1 UI | 线框图或截图 + 交互说明（涉及视觉时用 fuyao-coding 评审） | 每个页面/状态有对应 UI 定义 |
| R2 架构 | 变更说明：涉及的模块/表/IPC/Gateway 端点/MCP 工具 | 接口边界明确，符合既有分层 |
| R3 开发 | 代码 + 自测记录 | `npm run gate:fast` 绿 |
| R4 测试 | vitest 单测 + playwright E2E | 覆盖验收标准逐条 |
| G 门禁 | `npm run gate` 全绿 | 全量通过 |
| R5 发布 | CHANGELOG + 版本号 | 门禁绿 + 文档同步 |

---

## 1. R0 需求（产品）

**做什么**：写清「给谁、解决什么问题、怎么算完成」。

模板（`docs/specs/<feature>.md`）：

```markdown
# <Feature 名>
## 背景
（为什么做，用户痛点）
## 用户故事
- 作为<角色>，我希望<动作>，以便<价值>
## 范围内 / 范围外
（明确不做什么，防止蔓延）
## 验收标准（可测试）
1. ...
2. ...
## 依赖与风险
```

**规则**：
- 验收标准必须逐条可转化为测试用例——写不出测试的标准就是模糊需求。
- 一个 feature 一个 spec 文件，禁止口头需求直接开工。

## 2. R1 UI 设计

**做什么**：为每个新增页面/改动页面产出布局与交互定义。

- **轻量改动**：直接在 spec 里画 ASCII 线框 + 列出交互状态（loading/empty/error）。
- **视觉敏感改动**（新页面、布局重构、还原设计稿）：
  1. 产出或取得设计截图/设计稿；
  2. **用 fuyao-coding 内核对图**——图片类输入（设计稿、截图对比、还原度检查）统一路由到 fuyao-coding，由它输出「设计稿 vs 实现」的差异清单；
  3. 差异清单作为 R3 的输入逐条修复，修复后二次对图直到通过。
- 交互状态三问：空数据长什么样？出错长什么样？加载中长什么样？——三个都答不上来就回 R0。

**UI 验收门（UI Gate）**：
- 新 UI 必须过截图对比（实现截图 vs 设计稿/线框），由 fuyao-coding 出对比结论；
- 现有暗色主题变量（`app.css` 的色板/圆角/间距）不得引入第二套数值。

## 3. R2 架构设计

**做什么**：在 spec 追加「技术方案」一节，开工前对齐边界。

必须回答的清单：

| 项 | 问题 |
|---|---|
| 分层 | 改动落在哪层？main（服务/IPC/Gateway）/ preload / renderer / shared |
| IPC | 新通道？必须同步四处：`shared/ipc.ts` 常量 + `preload.cts` 白名单 + `registerIpc` handler + `global.d.ts` 类型 |
| DB | 新表/新列？走 Drizzle：`schema.ts` 定义 + `db/index.ts` 幂等 CREATE + `db:generate` 记录迁移 |
| Gateway | 新端点？鉴权策略（默认 Bearer token，`/health` 除外） |
| Agent/MCP | 新工具？同时更新内置工具循环清单和 `scripts/mcp-stdio.ts` |
| 日志 | 新模块用 `logger.child('<module>')` 打点（关键操作 info 级、带 runId/meta） |
| 测试 | 哪些逻辑进 vitest（纯逻辑/无 Electron 依赖），哪些进 E2E（真实 app 链路） |

**规则**：
- 依赖 Electron 的模块要为可测性预留注入点（参考 `SettingsStore` 收 DatabaseSync 参数、`initDatabase` 走 app 路径的拆分模式）。
- 密钥/敏感配置不硬编码；DB 配置 > env 的优先级约定保持不变。

## 4. R3 开发

**做什么**：按方案实现，边写边自测。

**分支与提交**：

```bash
git checkout -b feat/<feature-name>     # 从 main 切出
# 提交信息：type(scope): summary —— feat/fix/docs/test/chore
git commit -m "feat(settings): keychain encryption for provider keys"
```

**编码约定**（存量代码风格基线）：
- TypeScript strict；新代码禁止新增 `any`（存量 any 不强制回改，但不得扩散）。
- 主进程模块间用 `logger.child()` 打点；异步文件 IO 不得阻塞主进程事件循环（参考 logger 的 buffer+flush 模式）。
- preload 永远只暴露白名单方法，不暴露 `ipcRenderer` 本体。
- renderer 页面遵循现有 `page`/`panel`/`field` class 体系。

**提交门禁**：husky `pre-commit` 自动跑 `npm run gate:fast`（lint + 4×typecheck + build + vitest），失败即修复后再提交。

## 5. R4 测试（双层）

**做什么**：vitest 管逻辑层，playwright 管集成层。**两层都要，各司其职**：

| 层 | 工具 | 测什么 | 位置 | 运行 |
|---|---|---|---|---|
| 单元 | **Vitest** | 纯逻辑：解析器、provider 分支、logger ring/轮转、settings SQL 往返——**不依赖 Electron** | `tests/*.test.ts` | `npm run test`（秒级） |
| 集成 | **Playwright** | 真实 app：启动/IPC/内嵌浏览器/持久化/重启恢复——**完整链路** | `e2e/*.spec.ts` | `npm run test:e2e` |

**单测规则**：
- 需要新测的纯逻辑先抽函数（参考 `parseToolRequest` 从 AgentRuntime 抽出的模式）。
- 涉及 SQLite 的用 `:memory:` 或 tmp 目录 + 手工建表；需要 app DB 语义时通过注入句柄（`SettingsStore(db)`）。
- 断言行为不测实现：ring 容量断「保留最近 2000 条」而非内部数组长度常量。

**E2E 规则**（血泪教训，务必遵守）：
- **测试自足**：Playwright 在某条 test 失败后会重启 worker、重跑 beforeAll——**任何 test 不得依赖前一条 test 留下的状态**（settings.spec 的历史事故记录在 VERIFICATION.md）。
- **离线**：浏览器类测试统一打 `http://127.0.0.1:17992` 本地 fixture 页（`e2e/fixtures/`），禁止依赖外网。
- **隔离**：一律经 `launchApp()` 启动（临时 `CREATOROS_USER_DATA` + 独立 gateway 端口 17991），绝不碰真实用户数据目录。
- **读主进程数据**：`electronApp.evaluate` 里禁止动态 `import()`；直接在 spec 里 `new DatabaseSync(<userData>/data/creatoros.sqlite)`。
- 新增主进程能力 = 必须新增对应 E2E；新增纯逻辑 = 至少新增 vitest 用例。

## 6. G 门禁（全量）

**一条命令**：`npm run gate` = ESLint → 4×typecheck（renderer/main/e2e/test）→ build → vitest → Playwright E2E。

| 钩子 | 时机 | 跑什么 |
|---|---|---|
| husky pre-commit | 每次 `git commit` | `gate:fast`（不含 E2E，秒级） |
| husky pre-push | 每次 `git push` | `gate`（全量含 E2E） |
| GitHub Actions | push/PR 到 main | `gate`（macOS-14 + Node 24） |

**Definition of Done**（合入 main 的唯一标准）：
1. `npm run gate` 全绿（ESLint 0 error；测试 0 fail）
2. spec 的验收标准逐条有测试对应
3. UI 改动过视觉对比（fuyao-coding 结论存档）
4. 文档同步：USAGE_CN / ARCHITECTURE / API / SECURITY / VERIFICATION 涉及即更新
5. CHANGELOG 记入

## 7. R5 发布

```bash
npm version patch|minor            # 打版本
npm run package:dir                # 本地打包验证
git push --tags
```

- 历史版本验证状态以 `docs/VERIFICATION.md` 为准（每轮 gate 结果追加记录）。
- 未签名构建不分发到组织外。

---

## 8. Agent 内核与任务路由约定（团队协作）

本项目开发使用 Claude Code agent 内核（工具链：plan mode / subagent / 任务系统 / hooks），底层模型经内部 fuyao 路由。**按任务类型指定内核**：

| 任务类型 | 指定内核 | 原因 |
|---|---|---|
| 文字类研发（架构/编码/测试/文档） | 默认内核（fuyao-work 路由） | 长上下文工具链任务 |
| **图片类输入**（设计稿、UI 截图对比、还原度检查） | **fuyao-coding** | 视觉理解路由 |
| UI 实现后验收 | fuyao-coding 对图 → 修复用默认内核 | 各取所长 |

约定写进流程而非口头：R1 产出设计稿后，验收步骤明确写「fuyao-coding 对图」；无图任务不经过该路由。

## 9. 快速参考

```bash
npm run dev          # 开发
npm run test         # vitest 单测（秒级，提交前自动跑）
npm run test:e2e     # Playwright E2E（自动拉起 fixture server）
npm run gate:fast    # 提交门禁：lint + 4×typecheck + build + 单测
npm run gate         # 全量门禁：gate:fast + E2E（push/CI 跑这个）
```

相关文档：`DEVELOPMENT_PLAN_CN.md`（里程碑与工作量）· `USAGE_CN.md`（功能使用）· `ARCHITECTURE.md`（模块分层）· `VERIFICATION.md`（每轮验证记录）
