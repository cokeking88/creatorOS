# CreatorOS v0.4 — 中文说明

> 本地优先的自媒体 AI 运营工作台。一句话：**把浏览器、AI Agent、定时任务、内容库、账号管理装进一个桌面应用**，AI 操作的就是你眼睛看到的那个浏览器——登录一次，永久保持。

[English README](./README.md) | 截图见下方，全部来自真实运行的 App。

---

## 它解决什么问题

用 Claude + Chrome 做自媒体运营，痛点是散：聊天在 Claude、浏览器在 Chrome、登录态存在 Chrome、定时任务靠手动、内容草稿在备忘录里。CreatorOS 把它们变成一个整体：

- **内嵌持久浏览器**——真正的网页嵌在应用窗口里（Electron WebContentsView），每个账号绑定独立的持久 Profile，登录一次（扫码也行）写入磁盘，重启、隔天、隔周依然保持登录
- **AI 操作你眼前的页面**——内置 Agent（Claude Code 内核）通过浏览器工具操作的就是屏幕上那个浏览器，你随时可以看到它在点什么、填什么，随时可以人工接管
- **聊天和定时任务同一个引擎**——Agent 面板发一句话，和定时任务（cron）触发一段 prompt，走的是同一个 Agent 运行时，步骤实时滚动展示
- **永不外弹 Chrome**——登录弹窗、OAuth 窗口全部转成内部标签页；Agent 也永远不会启动外部浏览器

## 界面截图

| 浏览器工作区（内嵌网页） | 内嵌页面内容（Agent 可操控） |
|---|---|
| ![浏览器工作区](docs/screenshots/browser.png) | ![内嵌页面](docs/screenshots/browser-embedded.png) |

**Agent 执行步骤实时流**（工具名中文化：打开页面 / 读取页面 / 点击…，展开可看原始 JSON；✓/✗ 带耗时 → 文本打字机 → 完成行显示花费与耗时，小于 $0.01 显示 `<$0.01`）：

| 运行中（可随时停止） | 已完成 |
|---|---|
| ![运行中](docs/screenshots/agent-steps.png) | ![已完成](docs/screenshots/agent-done.png) |

| 工作台（最近 Agent 运行 / 定时任务运行） | 内容 |
|---|---|
| ![工作台](docs/screenshots/dashboard.png) | ![内容](docs/screenshots/content.png) |

| 自动化（cron 模板 + 下次运行预览 + 删除） | 日志 |
|---|---|
| ![自动化](docs/screenshots/automation.png) | ![日志](docs/screenshots/logs.png) |

| 设置（Agent 引擎配置） | 账号与身份 |
|---|---|
| ![设置](docs/screenshots/settings.png) | ![账号](docs/screenshots/accounts.png) |

---

## 快速上手（5 分钟）

### 1. 启动

```bash
cd ~/orca/projects/creatorOS
npm run dev
```

（首次需要 `cp .env.example .env` + `npm install`；国内网络装 Electron 若超时，用 `ELECTRON_MIRROR="https://cdn.npmmirror.com/binaries/electron/" npm install`）

窗口打开后，验证一下后端已就绪：

```bash
curl http://127.0.0.1:17890/health
# {"ok":true}
```

### 2. 登录你的第一个平台账号（核心体验）

1. 左侧导航点 **浏览器**
2. 工具栏 Profile 下拉选中 `Main Creator`（首次启动自动创建的持久身份）
3. 地址栏输入 `https://creator.xiaohongshu.com` 回车，像普通浏览器一样**扫码登录**
4. 登录完成后**重启 App 验证**：关掉窗口再开，页面依然是登录态——这就是 Profile 持久化

想给不同账号隔离身份？点浏览器页右上角 **＋ 身份** 新建浏览器身份（比如 `xhs-心理号`、`bilibili-主号`），切换身份即切换整套 Cookie/登录态。

### 3. 配置 Agent 引擎（让它真的能思考）

右侧 Agent 面板默认是 fake 演示模式。让它接真实模型：

1. 左侧点 **设置**
2. 填 Anthropic 协议入口（公司网关填 **Base URL** + **Auth Token**；或用官方 `ANTHROPIC_API_KEY`）
3. 点**测试连接**验证连通
4. 点**保存** —— 立即生效，不用重启

### 4. 和 Agent 对话（看着它干活）

右侧面板直接输入：

```
打开小红书创作中心，看看现在的登录状态，然后告诉我今天该发什么
```

发送后你会实时看到：

- `打开页面`（原始名 `browser_navigate` 收在展开详情里）—— 它在导航，点行可展开参数 JSON
- `✓ 打开页面 0.4s` —— 导航完成（✗ 是失败，可展开看原因）
- 文字部分打字机式流式输出
- `完成  <$0.01  8.2s` —— 结束，显示花费和耗时（小于 $0.01 合并显示）

运行中随时点**停止**中断。继续对话自动续接上下文（面板显示「会话已续接」）。

### 5. 建一个定时任务

左侧**自动化**页：

- 任务名：`每晚巡检登录状态`
- 执行周期选「自定义」，填 `30 23 * * *`（每天 23:30；表单会实时预览下次运行时间）
- 工作流类型选 **执行 Agent 任务**（定时任务也走 Agent，与聊天同一引擎）
- Agent 指令：`打开小红书创作中心检查登录态，如果掉线了记录下来`
- 点**创建任务**

到点（或通过 API 手动触发）后，Agent 面板顶部会出现「定时任务『每晚巡检登录状态』运行中…」横幅（可一键停止），步骤实时滚动——和聊天同一套机制。运行结果写入 `job_runs` 表，日志页可按 `agent` 模块过滤查看全过程；工作台也能看到这条运行记录。

### 6. 日常运营的推荐姿势

```
账号页：给每个运营账号绑定专属 Profile（一账号一身份，永不混用）
内容页：日常攒选题和草稿（idea → draft → scheduled → published）
浏览器页：让 Agent 打开创作中心自动填标题/正文，发布前人工确认
自动化页：把「每日热点」「数据巡检」「草稿整理」交给 cron
日志页：出问题先看这里（按模块/级别过滤，「详情」按钮展开）
```

---

## 常用命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | 开发启动（热更新） |
| `npm run build && npm start` | 生产模式启动 |
| `npm run test` | 单元测试（92 用例，秒级） |
| `npm run test:e2e` | 端到端测试（39 用例，全离线） |
| `npm run gate` | 全量门禁（lint + 类型检查 + 构建 + 双层测试） |
| `npm run mcp` | 启动 MCP 桥——让外部 Claude Code/Claude Desktop 操作同一个浏览器 |
| `npm run doctor` | 环境自检 |

## 数据在哪 / 怎么备份

```
~/Library/Application Support/creatoros/
├── data/creatoros.sqlite        # 全部业务数据（账号/内容/任务/运行记录）
└── Partitions/                  # 各 Profile 的登录态（Cookie 等）★
```

**备份 = 退出应用后整个目录拷走**。

## 常见问题

| 问题 | 答案 |
|---|---|
| Agent 一直没反应？ | Settings 没配引擎（fake 模式只回演示文本）；或点「测试连接」看报错 |
| 截图报 UnknownVizError | macOS 窗口被完全遮挡，把窗口切到前台即可 |
| click/fill 报 ref not found | 页面变了，Agent 会自己重新 snapshot；手动调用时先重新拿快照 |
| 想清空某 Profile 重登 | 退出应用，删对应的 `Partitions/<分区名>/` 目录 |
| 平台会封我吗 | 原则：固定 Profile 不换、操作可视化、发布类高危动作人工确认、不高频机械重复。UA 已做标准 Chrome 卫生化（不含 Electron 痕迹），但项目不做指纹伪装 |

## 更多文档

- `docs/USAGE_CN.md` —— 完整使用文档（17 章）
- `docs/QUICKSTART_CN.md` —— 快速开始
- `docs/ARCHITECTURE.md` —— 架构
- `CHANGELOG.md` —— 版本历史
- `docs/CODE_REVIEW_v0.3.md` —— v0.3 代码评审报告
- `docs/WORKFLOW_CN.md` —— 研发流程规范（R0-R5）
- `docs/DEVELOPMENT_PLAN_CN.md` —— 里程碑计划
- `docs/specs/` —— 各功能的需求/设计/测试产物链
