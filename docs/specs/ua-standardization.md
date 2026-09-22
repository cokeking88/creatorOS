# UA 标准化（浏览器卫生）

> 类型：小改动（config 级）。R0/R1 合并：无 UI 改动、无新页面状态。按 WORKFLOW_CN 比例原则轻量执行，但停止线不放宽：验收标准可测、门禁全绿、文档同步。

## 背景

Electron 默认 UA 自带 `Electron/44.4.0`（打包后还带 `CreatorOS/x.y.z`）token。嵌入浏览器里的**人工**正常操作也因此被打上"自动化/embedded 工具"标签——这不是用户应得的。Slack/Notion 等嵌入式产品均以标准浏览器 UA 呈现，属常规卫生做法。

**范围外（明确不做）**：指纹伪装（canvas/WebGL/audio 噪声、版本伪造、行为拟人化、CDP 痕迹隐藏）。引擎真实 Chromium 版本保留在 UA 中——版本与引擎能力一致性优先于"看起来像最新稳定版 Chrome"；伪造会产生更强的自动化信号。见 docs/SECURITY.md。

## 验收标准

1. **AC1**（vitest）：`standardChromeUa(version, platform)` 纯函数——darwin/win32/linux 三平台 token 正确；UA 含 `Chrome/<真实引擎版本>`；不含 `Electron`/应用名；version 缺省时回退默认格式。
2. **AC2**（e2e，离线 fixture）：嵌入 session 中 `navigator.userAgent` 含 `Chrome/`、含平台 token、不含 `Electron`、不含 `creatoros`。
3. **AC3**：`ProfileManager.getSession()` 对每个 persist session 设置该 UA（创建 tab 加载前生效）。
4. **AC4**：`npm run gate` 全绿；SECURITY.md 补一行卫生与伪装的边界声明。

## 实现

- 新文件 `src/main/browser/ua.ts`：纯函数（无 electron import，vitest 可直接测）。
- `ProfileManager.getSession()` 增 `ses.setUserAgent(standardChromeUa())`。
- `tests/ua.test.ts`（vitest）+ `e2e/browser.spec.ts` 增用例。
