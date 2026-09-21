# CreatorOS 快速开始

## 1. 环境

建议 macOS + Node.js 22 或更高版本。项目运行时使用 Electron 44 内置的 Node 24，因此 SQLite 直接使用 `node:sqlite`，无需额外编译 sqlite native addon。

## 2. 第一次启动

```bash
cp .env.example .env
npm install
npm run dev
```

如果你安装了 pnpm：

```bash
corepack enable
pnpm install
pnpm dev
```

macOS 也可以双击：

```text
scripts/start.command
```

首次启动会自动创建：

- 一个默认 Workspace
- 小红书 / 抖音 / Bilibili / 微信公众号四个平台
- 一个持久化 Browser Profile
- 一条示例草稿
- 一个关闭状态的示例 Cron Job

## 3. 使用 Profile

进入 **Accounts** 或 **Browser** 创建 Profile。Profile 对应 Electron 的 `persist:` Session，Cookie、LocalStorage、IndexedDB、缓存等由 Electron 持久保存。

建议：

```text
一个真实运营身份 / 账号 → 固定 Browser Profile
```

不要每次运行任务新建 Profile。

## 4. 登录平台

进入 **Browser**，选中对应 Profile，然后像普通浏览器一样登录小红书/B站等平台。后续人工操作、内置 Agent、Cron、外部 MCP 都复用这一个内部 Browser Runtime。

## 5. 内置 Agent

内置 Agent 内核是 **Claude Code Agent SDK**：每次运行 spawn 一个 `claude` CLI 子进程，通过 Anthropic 协议调用模型。没有 Key 时启动不报错，发起 Agent 运行时才需要配置。

推荐在应用内 **Settings 页面**配置（保存即热生效，无需重启）；也可在 `.env` 里配置首次启动默认值：

```env
ANTHROPIC_BASE_URL=https://api.anthropic.com   # 公司网关/中转站填这里
ANTHROPIC_AUTH_TOKEN=xxx                         # Bearer Token（与下面 Key 二选一，优先）
ANTHROPIC_API_KEY=sk-xxx                         # x-api-key
ANTHROPIC_MODEL=claude-sonnet-4-5
```

内置 Agent 通过进程内 MCP server（15 个 `browser_*` 工具）操作当前 `WebContentsView`，不会启动外部 Chrome。执行步骤会实时流式展示在右侧 Agent 面板。

## 6. Claude / 外部 Agent 通过 MCP 使用

先启动 CreatorOS，然后：

```bash
npm run mcp
```

MCP Server 只是桥接层，它通过本地 Gateway 操作**正在运行的 CreatorOS 内部浏览器**，不会创建第二个浏览器。

具体配置见 `docs/MCP.md`。

## 7. Cron

Automation 页面可以创建 Cron Job。当前 MVP 内置：

- `demo`
- `browser.navigate`
- `agent.run`（v0.3 新增：到点把 prompt 交给与聊天同一引擎的 Claude Code Agent 执行，步骤实时出现在 Agent 面板）

后续可以在 `Scheduler.ts` / workflow 层继续加入发布、采集、统计等流程。

## 8. 打包

```bash
npm run build
npm run package:dir
```

macOS：

```bash
npm run package:mac
```

当前配置默认生成未签名构建。正式分发需要配置 Apple Developer 签名/Notarization。

## 9. 当前版本定位

这是一个完整的 **MVP 源码工程**，核心底座已经实现，但不是“开箱即用的无人值守小红书发布器”。真正投入长期运营前，建议继续实现：

- 小红书/B站/抖音 Platform Adapter
- 发布前人工确认策略
- 内容素材上传/下载管理 UI
- DOM selector fallback 与页面版本适配
- Keychain 密钥存储
- Feishu 签名校验和命令路由
- 自动化测试与 crash recovery 增强
- 账号级速率限制和审计日志
