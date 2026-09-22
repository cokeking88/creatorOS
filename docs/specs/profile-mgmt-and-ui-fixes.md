# Profile 管理与两处 UI 修复

> 类型：bugfix + 小功能。R0/R1 合并产出（无新 IPC 通道、无 DB 变更、无架构变更——全部 renderer 层）。

## 背景

试用反馈三个问题：
1. **Agent 面板不能滚动**：步骤多时内容溢出面板，无法回看。
2. **浏览器工具栏 ＋P 无反应**：点击无任何反馈。
3. **缺 Profile 管理界面**：profile 只能在 Browser 页下拉切换，无处查看全量、重命名、了解绑定关系。

## 根因（已定位）

1. `.agent` grid 为 `55px auto 1fr auto` 四行，但无 cron-banner 时只有 3 个子元素（header/chat/composer）——chat 落进 `auto` 轨。`auto` 行高由内容撑开、永不触发 overflow，`.chat{overflow:auto}` 成死代码；内容把整个面板顶出窗口。
2. `BrowserPage`/`AccountsPage` 的 ＋P 按钮用 `window.prompt` 采集名称——Electron `sandbox:true` 渲染器中 `window.prompt` 被禁用，静默返回 undefined，onclick 早退 → 「点了没反应」。
3. profile 管理无界面（历史设计只在 Browser 工具栏做即时切换）。

## 范围内 / 范围外

- 内：三处 renderer 修复/新增；AccountsPage 增加 Profiles 管理面板（列表+重命名+新建，替代 window.prompt）。
- 外：不加 profile 删除（删除涉及 tab/会话清理，M3 随 Adapter 一起做）；不动 IPC 通道集合（重命名复用现有 profile.create？——**检查**：无重命名通道 → 新增 PROFILE_RENAME IPC，四处同步）；不动 DB。

## 验收标准

- **AC1**：Agent 步骤超过面板可视高度时，chat 区可滚动（scrollTop 生效、composer 固定底部不被顶走）。
- **AC2**：Browser 工具栏 ＋P 点击后出现内联名称输入（不再依赖 window.prompt），回车创建并激活新 profile、下拉自动选中；Esc 取消。
- **AC3**：Accounts 页新增「Browser Profiles」面板：列出全部 profile（名称/绑定账号/平台/创建时间），可新建、可重命名（重命名后 Browser 下拉同步显示新名）。
- **AC4**：window.prompt/confirm 在 renderer 全库零残留（grep 断言）。
- **AC5**：`npm run gate` 全绿；新交互有 e2e 覆盖（＋P 内联输入创建 profile 一条；agent 面板滚动断言一条）。

## 设计要点

- `.agent` 改 `grid-template-rows: 55px auto minmax(0,1fr) auto` 且 `.chat{min-height:0}`——修溢出的关键是让滚动容器拿 `minmax(0,1fr)` 而非 auto。
- ＋P 内联输入：复用 toolbar 风格的小输入框，Enter 确认/Esc 取消/失焦取消；无障碍加 aria-label。
- PROFILE_RENAME IPC：`profile:rename` 通道，`registerIpc` handler 调 `repo.renameProfile`（repository 新增方法，同步 browser_profiles 行）。
