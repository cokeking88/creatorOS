# UI 重构 R3 实施与视觉验收报告

- 分支：`feat/ui-redesign`（从 `371f523` 切出）
- 规范依据：`docs/specs/ui-redesign.md`（R1 §1–§6 + R2 §7，R2 修正版契约优先）
- 实施方式：两批子 agent（批 1 基建+main+shared，批 2 renderer 页面+e2e），主会话逐文件复核 + 视觉验收
- 日期：2026-09-22

## 一、改动总览

| 层 | 文件 | 内容 |
|---|---|---|
| shared | `cronNext.ts`（新 102 行）、`format.ts`（新 26 行） | cron 下次运行预览（两步契约 parseCron/nextCronDate，node-cron AND 语义对齐）、fmtCost/fmtDur/toolLabel |
| shared | `ipc.ts`、`types.ts` | JOB_DELETE / AGENT_RUNS_LIST 常量；AgentRunSummary / JobRunSummary / AgentRunsOverview |
| main | `registerIpc.ts` | 2 个新 handler（runsList 显式行类型 + JSON.parse 兜底；JOB_DELETE 薄句式 + jobsLog）；`repository.ts` deleteJob 两步级联 |
| main | `TabManager.ts` | 「New Tab」→「新标签页」（loading 指示已改为结构化 .tab-dot，did-stop-loading 原逻辑确认存在未动） |
| preload | `preload.cts` | 常量表 +2；jobs.delete / agent.runsList |
| renderer | `icons.tsx`（新）、`Empty.tsx`（新） | 手写 SVG 图标集（0 依赖）；统一空态组件 |
| renderer | 全部 9 页面 + Sidebar + AgentPanel | 按 §3.x 逐页改造：中文文案、按钮四 class、SVG 图标、空态、cron 模板+预览、两段式删除、files 树 ResizeObserver、统计卡副行 |
| renderer | `app.css` | 全量 token 化：色板变量、color-scheme:dark、字号五档、8px 栅格、按钮系统、panel 微阴影 |
| e2e | 6 处断言同步改 + 2 新 spec | dashboard.spec（3 用例）、automation-delete.spec（2 用例）、AC-B2/AC-F3 断言、launch 溢出循环化 |
| tests | 2 新文件 31 用例 | cron-next（22：基础/月末/闰年/无解/非法/AND 语义）、format（9） |

## 二、门禁与测试结果（R3 时点）

- `npm run gate:fast`：ESLint 0 error（42 存量 warn）→ 4×typecheck → build → **vitest 92/92**（61 存量 + 31 新增）
- `npm run gate`（全量）：+ **playwright 39/39**（9 spec 文件；新增 dashboard 3 + automation-delete 2；6 处文案断言同步：设置/保存/测试连接/浏览器/文件/工作台）
- AC-无新依赖：package.json 零 diff

## 三、机械 AC 自检（规范 §六）

| AC | 命令 | 结果 |
|---|---|---|
| AC-对比度 | grep 旧色值 8 个 | 0 残留 ✅ |
| AC-G10 | grep `6f8cff` | 0 ✅ |
| AC-G3 | 裸 `<button` 无 className | 0 ✅（全站 4 class 体系） |
| AC-G8 | grep 旧文案 12 组 | 0 ✅ |
| AC-AP3 | grep `toFixed(4)` | 0 ✅（<$0.01/<0.1s 生效） |
| AC-S1 | grep unicode 图标 ◫◎◉✜⌁⌗ | 0 ✅（全 SVG） |
| AC-F4 | grep 📄▸▾ | 0 ✅ |
| AC-B5 | grep `Embedded WebContentsView` | 0 ✅ |
| AC-IPC | 四处同步 | ipc.ts/preload/registerIpc/global.d.ts 各命中 ✅ |

## 四、视觉验收（UI Gate，15 张截图 × R1 §5.2）

截图：`docs/screenshots/redesign/`（01-browser … 12-native-controls，1440×900@2x，fake 模式离线）
脚本：`scripts/capture-ui-redesign.mts`（Playwright 驱动真实 app；example.com 导航用 native `/api/app/screenshot`）

**通过项**（对照清单全绿）：顶栏重排/「＋ 身份」/tab 无常驻点/占位文案、工作台双列表真实数据（<$0.01/<0.1s 格式化实测生效）、身份绑定双 pill、文件树 SVG+无内部 ID+编辑器蓝保存键、草稿库平台 pill+中文状态、cron 模板+「下次运行」预览+删除按钮、日志 chevron 详情、设置页 Save 蓝/测试连接灰/help 行、Agent 中文工具名+spinner+完成态格式、原生控件全暗色（checkbox accent、无白底）。

**审查中撤销的两个疑似问题**（避免误修复）：
- ~~侧栏文字竖排~~：4x 放大图误判；DOM 实测 Range.getClientRects()=1 单行 36px，正常。
- ~~Agent 导航地址栏不更新（R0 的 B1）~~：probe 实证 fake 模式下地址栏更新正确，R0 审计已撤销该项。

**记录在案的 4 个非阻塞收尾项**（下次打磨，不进本次 AC）：
1. Dashboard 统计卡副行在长账号名下略显拥挤（视觉验收 02 号）
2. Logs 消息列在超长 meta 行下观感偏窄（08 号）
3. Empty 空态在 Agent 面板首开的 chips 横排偏宽（01 号对照）
4. Agent header「运行中…」仅色区分、无字号/重量变化（10 号）

## 五、过渡清理确认（批 1 遗留清单逐项核销）

- `.composer button` 蓝底规则：已删（AgentPanel 改 `.btn-primary`）✅
- `.sidebar button b{font-size:20px}` 旧 unicode 槽：已删（SVG 化）✅
- `.brand` 文字样式：已改 BrandMark+CreatorOS ✅
- F5 浮层单行条（.files-creating absolute）：已落 ✅
- `.row button` 特异度规则：已删，Save 恒蓝（T1 修复，09 号截图实证）✅
- `.link-btn`：保留（批 2 决定留旧类同 `.btn-link`，e2e 无断言依赖，样式同源）——R5 后可并入 .btn-link 再清理

## 六、已知边界（R2 §7.8 5 项均按评估落地）

- job 运行中删除：孤儿 agent_runs 行保留（audit trail 语义），幂等 UPDATE 0 行——按 R2 评估可接受
- cronNext 拒绝 `N/step`、`?` 仅 dom/dow：与 node-cron validate 实测对齐（vitest 用例⑥）
- settings.spec DOM 顺序约束：四输入框顺序未动，e2e 绿
- capturePage 遮挡缓存帧：截图脚本先导航后截图，15 张无陈旧帧
