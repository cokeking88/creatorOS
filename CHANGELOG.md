# Changelog

## 0.5.0（2026-09-23）— Agent 全能力 + 技能系统

R0→R4 工作流（spec `docs/specs/agent-capabilities.md`，含 R2 §13.10 工具计数勘误 10 个）：

### Agent 工具面（creatoros-app MCP server）
- 新挂第二个进程内 SDK MCP server `creatoros-app`：10 个工具 = 只读四件套（job_list/content_list/account_list/skill_list，含 job_list 的 nextRunAt/技能名/摘要增强）+ 写五个（job_create/job_toggle/content_create/content_update/skill_create）+ 高危一个（job_delete，双重 warn 日志门 + 系统提示词约束）
- 工具定义单源 `appToolDefs.ts`：SDK 宿主、外部桥、vitest 三处共用，名字/description/zod schema 结构性不可漂移
- 围栏常量化 `agentPolicy.ts`：allowedTools 显式列举两 server 通配 + 文件五件套、DISALLOWED_TOOLS（Bash/NotebookEdit）、PreToolUse matcher 扩 app 段、SYSTEM_APPEND 新增两条（定时任务复述纪律 + 技能模板禁止网页原文）——改围栏 = 改这个文件，vitest 断言常量
- cron 校验三口收敛（D6）：统一取严（parseCron 口径），权威闸门落 `Scheduler.validateJobInput` 单点——Agent 建的任务永远能在自动化页预览
- job 创建经路三口收敛（§13.8）：IPC/Gateway/MCP 工具全走 Scheduler 实例方法，reload 不再可能被遗漏

### 技能系统
- `skills` 表（第 12 张，origin manual/agent 调用层硬编码）+ 注入句柄 SkillsRepo（vitest 可测形态）
- 技能页（侧栏第 9 项）：新建/编辑双态表单、运行（走既有 agent.run，与 chat 同引擎）、两段式删除（绑定计数提示不拦截）、内联绑定 cron 表单（共享 cronPreview 三态文案）
- Agent 面板空态「运行技能」chips：模板文本填入 composer 不自动发送（占位符用户替换后再发送）
- cron 绑定引用语义（§2.4 方案 A）：payload 存 skillId——改模板任务行为跟随；删技能任务显式失败（「绑定的技能已被删除，请重新配置或删除该任务」），任务行不级联删并显「技能已删除」警示 pill
- 自动化页「写指令/选技能」radio-segmented 二选一
- Dashboard 第 5 卡（技能数 + 最近更新相对时间）
- 外部桥进只读四件套（D5）：Gateway 新增 4 个 GET（/api/jobs|/api/contents|/api/accounts|/api/skills），写/高危不进桥

### 工程与测试
- vitest **146→149**（14 files：skills-repo、app-tools 10 工具直测、bridge 20 工具单源断言、cron-preview 三态、policy 常量锚定）
- playwright **48→52**（12 specs：skills-page 6、skill-cron 3、gateway-quartet 2 新 spec、cron-agent gateway 400 组增补）
- 文档：SECURITY.md #9 重写 + #13 新增、MCP.md 桥面清单、DATABASE.md skills 表、测试报告 `docs/specs/agent-capabilities-test-report.md`
- 零新增 npm 依赖；fake 模式盲区（真工具链路）手测清单见测试报告

## 0.4.0（2026-09-22）— 全站 UI/UX 重设计

按 R0→R5 工作流完成的界面重做（审计 46 有效项全部处置，其中 B1 经实证撤销）：

### 视觉体系
- 暗色色板收敛为三层背景（原 6 层近灰），全部文字/底色对比度 ≥4.5:1（accent 从 #6f8cff 加深到 #4760d5）
- `color-scheme: dark`：原生控件（复选框/下拉/按钮）不再出现 UA 白底
- 字号五档（28/20/16/13/11）、8px 间距栅格、圆角收敛 8/12 两档
- 按钮系统收敛为 .btn-primary/.btn-ghost/.btn-danger/.btn-link 四类，统一高度、hover/active/disabled/focus 反馈（原四套样式三种高度零反馈）
- 手写 SVG 图标集（0 新依赖）替换全部 unicode 字符图标；品牌区改 SVG mark + CreatorOS

### 界面与交互
- **界面中文化**：页面标题/按钮/表头/空态/状态全部中文，专有名词（Profile、cron、Base URL）保留英文；统一术语表（浏览器身份/运营账号/定时任务）
- **工作台重做**：4 张运营统计卡（带副行）+ 最近 Agent 运行 + 最近定时任务运行（真实 agent_runs/job_runs 数据，新增 `agent:runs.list` IPC）
- **自动化增强**：cron 模板下拉（每天/每小时/每周一/自定义）+ 下次运行时间预览（`shared/cronNext.ts`，与 node-cron AND 语义对齐）；任务可删除（新增 `job:delete` IPC，两段式确认，job_runs 级联清理）
- **Agent 面板**：工具名中文化（打开页面/读取页面/点击…，原始名收进展开详情）、<$0.01/<0.1s 成本格式化、cron 横幅蓝系化并加停止按钮、空态加快捷指令
- **文件页**：不再暴露内部账号 ID、树高度自适应（ResizeObserver）、SVG 文件图标、新建/重命名浮层不再挤压布局
- **浏览器页**：顶栏重排（←→↻ 地址栏 ＋ 身份下拉 ＋ 身份）、「＋P」→「＋ 身份」、loading 改结构化圆点、「新标签页」
- **日志页**：chevron+「详情」按钮、刷新按钮可访问性、列宽优化
- **设置页**：保存按钮恒蓝（修复被覆盖成灰色的 bug）、字段下 help 行、Model 候选下拉

### 工程与测试
- vitest 92（+31：cron 边界/格式化）、playwright 39（+6：dashboard 数据、任务删除级联、loading 点、树高度；6 处文案断言同步）
- 零新增 npm 依赖；e2e 选择器契约表与同步清单见 `docs/specs/ui-redesign.md` §5.1
- 视觉验收 15 张截图（`docs/screenshots/redesign/`）+ 开发/测试报告

## 0.3.3（2026-09-22）— 账号文件目录 + Agent 围栏

- 每个运营账号一个专属目录（drafts/assets/data/CLAUDE.md），内置 CodeMirror 6 编辑器 + react-arborist 文件树 + chokidar 监听
- Agent 文件工具（Read/Write/Edit/Glob/Grep）以账号目录为 cwd；PreToolUse hook realpath 围栏（含 symlink 防逃逸），Bash 一律拒绝
- 安全修复：v0.3.0–v0.3.2 `allowedTools` 不能约束 bypassPermissions（SDK 语义），文件工具与 Bash 实际开放；本版以 hook 围栏 + disallowedTools 收口（SECURITY.md #12）

## 0.3.2（2026-09-22）— 修复 SDK「binary failed to launch」误导错误

- 根因：`cwd` 指向从未创建的 `agent-workspace` 目录，CLI 启动 chdir 失败被 SDK 归类为二进制/libc 错误
- 修复：spawn 前 `mkdirSync(workspace, { recursive: true })`

## 0.3（2026-09-22）— Agent 内核替换为 Claude Code SDK

- 自研 JSON 工具循环移除，改 `@anthropic-ai/claude-agent-sdk` query()（spawn claude CLI 子进程）
- 执行步骤实时流式展示（stream_event → StepBus → IPC event）；聊天与 cron 任务共用同一引擎（`agent.run` workflowType）
- 进程内 MCP server 暴露 15 个浏览器工具；CLAUDE_CONFIG_DIR 隔离子进程；UA 卫生化（保留真实引擎版本，不做指纹伪造）
- 测试：vitest 43 + playwright 27（fake 模式离线全链路）

## 0.2 / 0.2.1（2026-09-21）— 真机 bring-up + 门禁体系

- npm install/typecheck/build/生产启动冒烟全过；gate 工具链（ESLint→4×typecheck→build→vitest→playwright）
- 结构化日志（ring 2000 + 按日落盘 + 模块 child）；Settings 页 LLM 网关配置热生效
- WORKFLOW_CN.md：R0→R5 全流程规范

## 0.1（2026-09-21）— 初始化

- 从 ChatGPT 生成方案落地：Electron 44 + React 19 + SQLite(node:sqlite) + Drizzle；内嵌持久化浏览器、MCP 双通道、本地 Gateway
