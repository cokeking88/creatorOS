# CreatorOS UI 重设计规范（R1）

- 依据：`docs/specs/ui-audit-47.md`（46 有效项，B1 已撤销）
- 目标：R3 按本文档逐条实施，可直接粘贴的 token / class / 文案为硬规范，其余为布局与交互定义
- 审计项编号（G1/S1/D1…）在每条决策后标注，便于追溯与验收
- 源码事实核对（2026-09-22，commit 64b1c34）：registerIpc.ts / schema.ts / TabManager.ts / browserTools.ts / 全部页面源码均已逐行核对；凡写「R3 需新增 IPC」处，均为确认现有面不存在后给出的契约

## 0. 语言与术语策略（G8）

**策略：界面中文为主，专有名词/技术字段保留英文。**

- 保留英文（用户认知中它就是英文）：Profile、Account/账号管理语境下的字段名、cron、Base URL、API Key、Token、Model、Agent、Job name（改为「任务名」）、CLAUDE.md、MCP
- 一律中文：页面标题、按钮、表头、空态、提示、状态、侧栏标签
- 全站统一叫法（见 §4 术语表）；同义不同语（「空闲」vs「No Profile」）一律收敛

---

## 一、Design tokens（G1/G4/G6/G7/G9/G10）

### 1.1 色板（可直接粘贴进 app.css 顶部）

```css
:root {
  /* 三层背景收敛：原 6 层近灰 → 3 层 + 悬浮 + 边框（G7）。
     相邻层 8-bit 灰阶差 8~16，肉眼可辨。 */
  --bg-0: #0b0d12;        /* 最底层：app / 浏览器内容条 / 输入框内嵌底 */
  --bg-1: #151922;        /* 结构层：sidebar / agent 面板 / tabs 条 */
  --bg-2: #1e2431;        /* 内容层：panel / card / tab active / 弹层 */
  --hover: #262d3d;       /* 悬浮/激活微底：行 hover、ghost 按钮底、激活态底 */
  --border: #2c3342;      /* 面板/卡片 1px 边框 */
  --border-strong: #4a5570; /* 输入框边框（对 --bg-0 2.50:1，UI 组件边界 ≥3 的是 --border-strong 的强化版可选值） */

  /* 文本三层（G4）*/
  --text:   #e8ecf4;      /* 主文本：标题/正文/输入值 */
  --text-2: #a3adbf;      /* 次文本：描述、help、表头、tab 未激活 */
  --text-3: #8791a5;      /* 辅助/禁用/时间戳/占位符（WCAG 下 disabled 控件豁免，本档仅用于非关键信息） */

  /* accent：#6f8cff 白字仅 3.06:1（G10），加深到 #4760d5 = 5.38:1 */
  --accent:       #4760d5; /* 实底（primary 按钮底、tab 竖条等大色块）*/
  --accent-text:  #8ba3ff; /* 文字/图标用 accent（链接、focus ring、运行中状态）*/
  --accent-hover-text: #a5b8ff; /* 链接 hover 变体 */

  /* 语义色：文字档（放在 bg-2 上 ≥4.5）+ 15% 透明底档（对 bg-2 用 color-mix，R3 目标 Electron 44 的 Chromium 136 支持原生 color-mix）*/
  --ok:    #4ecb82;  --ok-strong:    #1e6f47; /* strong=实底按钮用 */
  --warn:  #e6bb4a;  --warn-strong: #8a5a1e;
  --err:   #f28585;  --err-strong:  #a83535;  /* danger 按钮底 */
  --info:  #6f9bff;
  /* 15% 透明底变体（替代第六层灰的浅色提示底，G7）：
     background: color-mix(in srgb, var(--ok) 15%, var(--bg-2)) 等 */
}
```

对比度计算表（WCAG 相对亮度法，全部 ≥4.5:1 的在用组合；每个色注明「色 on 底」）：

| 组合 | 值 | 组合 | 值 |
|---|---|---|---|
| --text on --bg-0 / --bg-1 / --bg-2 | 16.41 / 14.85 / 13.12 | --text-2 on --bg-0 / --bg-1 / --bg-2 / --hover | 8.59 / 7.78 / 6.87 / 6.09 |
| --text-3 on --bg-0 / --bg-1 / --bg-2 | 6.13 / 5.55 / 4.90 | --accent-text on --bg-0 / --bg-1 / --bg-2 / --hover | 8.13 / 7.35 / 6.50 / 5.76 |
| #fff on --accent #4760d5 | **5.38**（G10 达标） | #fff on --accent hover #5066e0 / active #4158c4 | 4.86 / 6.14 |
| #fff on --err-strong / hover(#bc3b3b) / active(#9b3131) | 6.51 / 5.49 / 7.30 | #fff on --ok-strong / hover(#227c50) | 6.14 / 5.16 |
| --ok on --bg-2 / --bg-1 | 7.54 / 8.53 | --warn on --bg-2 / --bg-1 | 8.56 / 9.69 |
| --err on --bg-2 / --bg-1 | 6.26 / 7.09 | --info on --bg-2 / --bg-1 | 5.78 / 6.54 |
| 15% 底色上的字：text on 语义 15% tint（bg-2 基） | 9.49~11.45 | --text-2 on 各语义 tint | 4.97~5.99 |
| cron 横幅：--accent-text on accent 15% over --bg-1 | 6.41 | 语义色 on 自身 15% tint（err 4.85 / ok 5.62 / warn 6.19 / info 4.48） | ≥4.48 |

规则：**文字永远不直接放在 --accent 实底以外的彩色实底上**；彩色文字只允许出现在 --bg-0/1/2/hover/对应 15% tint 上。

15% tint 的字面值（若不想用 color-mix 可直接写，等价于对 bg-2 的预混）：
tint-ok `#253d3d` / tint-warn `#3c3b35` / tint-err `#3e333e` / tint-info `#2a3650` / tint-accent `#242d4a`。

### 1.2 `color-scheme: dark`（G1 止血，一行）

```css
:root { color-scheme: dark; }
```

这让 UA 原生按钮/复选框/select 下拉自动变暗色。另加 native 兜底：

```css
input[type="checkbox"] { accent-color: var(--accent); width: 15px; height: 15px; }
select { background-color: var(--bg-0); color: var(--text); }
select option { background-color: var(--bg-2); color: var(--text); } /* 下拉展开列表暗色 */
```

### 1.3 字号五档（G6：h3 现在只有 14px 比正文小，层级倒挂）

| 档 | px | 映射 |
|---|---|---|
| display | 28 | `.page h1`（每页唯一）|
| h2 | 20 | `.panel h2`（显式声明，现在 UA 默认 24px）|
| body | 16 | `.panel h3`、输入框文字、正文段落 |
| secondary | 13 | 按钮、表单 label、气泡 `.bubble`、`.content-item p`、侧栏标签（S2 由 11px 提到 12px，见 §2.1——侧栏是唯二例外）|
| caption | 11 | 时间戳、`.muted small`、pill、step hint（G4：色提到 ≥--text-2，11px 仅用于非关键信息）|

删除 `font-size:12.5px`（logs）、`11.5px`（step-label/test-detail）、`10.5px`（step-time）这类单发值，归入上表。**h3 从 14px 改为 16px，是修复层级倒挂的最低成本路径。**

```css
.page h1 { margin: 0; font-size: 28px; }
.panel h2 { margin: 0 0 12px; font-size: 20px; font-weight: 600; }
.panel h3 { margin: 16px 0 8px; font-size: 16px; font-weight: 600; color: var(--text); }
p, .bubble { font-size: 13px; }
.muted { color: var(--text-2); }
```

### 1.4 间距：8px 栅格（G9，现在 12/14/22 漂移）

档位只用 4 / 8 / 12 / 16 / 24 / 32：

| 用途 | 档 |
|---|---|
| `.page` padding | 24（现在 28，归档）|
| `.panel` / `.card` padding | 16（现在 18）|
| 表单 `.field` 之间 gap | 12（field margin-bottom 统一 12，现在 10）|
| `.content-grid` gap | 16（现在 18）；`.cards` gap 16（现在 14）；`.files-grid` gap 16（现在 14）；`.files-page` gap 12 保留（它本来就是 12px 档）|
| 区块间距（h1 → 副描述 → 工具栏 → 内容） | 24（content-grid margin-top 现在单发 22，删掉用 gap）|

实现方式：`.page` 改为 `display:flex; flex-direction:column; gap:24px`，子区块不再自带 margin（这是 G5 拉满高度的前置）。

### 1.5 圆角：收敛到 2 个（G3）

```css
:root { --radius-s: 8px; --radius-l: 12px; }
```

| 组件 | 圆角 |
|---|---|
| 按钮 / 输入框 / select / inline pill / step / logs 行 hover 底 / tab 条按钮 | 8px |
| panel / card / files-tree / files-editor / logs-table / 气泡圆角上限 | 12px |
| 气泡 `.bubble`（11px 归 12） | 12px |
| pill | `999px` 保留（胶囊是第三种语义：状态徽章，不算「圆角体系」）|

删除 7px（browser-top）、9px（primary/field）、10px（sidebar）、14px（panel）这些单发值。

### 1.6 按钮系统（G2/G3/T1）——四个 class，全站替换

统一定义（高度 32px、r8、transition 120ms、ghost/danger 用 hover `brightness(1.12)`、primary 用换算好的固定亮/暗色保持白字 ≥4.5:1、active `0.92`、focus-visible outline）：

```css
:root { --btn-h: 32px; --btn-transition: filter 120ms ease, background-color 120ms ease; }

/* 基类：所有 button 先归一（G1 的 UA 白底止血之二）*/
button {
  font: inherit; font-size: 13px; height: var(--btn-h); padding: 0 14px;
  border-radius: var(--radius-s); cursor: pointer;
  transition: var(--btn-transition);
  background: var(--hover); color: var(--text); border: 1px solid var(--border);
}
button:focus-visible { outline: 2px solid var(--accent-text); outline-offset: 2px; }
button:hover:not(:disabled) { filter: brightness(1.12); }   /* G2：全站 hover 反馈 */
button:active:not(:disabled) { filter: brightness(0.92); }
button:disabled { color: var(--text-3); cursor: not-allowed; filter: none; opacity: 0.7; }

/* 主按钮：蓝底白字（G10 对比 5.38:1）*/
.btn-primary {
  background: var(--accent); color: #fff; border-color: transparent; font-weight: 600;
}
/* 例外：primary 不走 brightness(1.12)（会把白字拉到 3.97:1），换算好的亮色 hover 保持 4.86:1 */
.btn-primary:hover:not(:disabled) { filter: none; background: #5066e0; }
.btn-primary:active:not(:disabled) { filter: none; background: #4158c4; }
.btn-primary:disabled { background: var(--accent); color: #fff; opacity: 0.45; }

/* 幽灵按钮：灰底（工具栏/次操作）*/
.btn-ghost { background: var(--hover); color: var(--text); border: 1px solid var(--border); }

/* 危险按钮：仅删除/停止类操作 */
.btn-danger { background: var(--err-strong); color: #fff; border-color: transparent; }

/* 链接按钮：行内文字操作（重命名/详情等）*/
.btn-link { background: transparent; border: 0; height: auto; padding: 4px 6px;
  color: var(--accent-text); font-size: 12px; }
.btn-link:hover:not(:disabled) { color: var(--accent-hover-text); filter: none; }
```

**特异度修复（T1）**：`.row button`（0,1,1）压过 `.primary`（0,1,0）导致 Save 变灰的问题，修法二选一，本文档定为 **删掉 `.row button` 规则**（R3 把 SettingsPage 两颗按钮改成 `.btn-primary`/`.btn-ghost` class 后该规则无存在意义；同时全局搜索确认 `.row button` 仅 Settings 用到）。若 R3 期间发现其他地方依赖 `.row button`，回退方案是提高特异度为 `.row .btn-primary { background: var(--accent); color:#fff; }`。

**全站 14 处按钮逐个替换表**（源码核对，页:行为 → class）：

| # | 位置 | 现状 | 改为 |
|---|---|---|---|
| 1 | Sidebar.tsx 8 个导航 button | 无样式（active 态） | 不走 .btn 体系，见 §2.1 侧栏规范 |
| 2 | BrowserPage「＋P」→「＋ 身份」 | 无 class | `.btn-ghost` |
| 3 | BrowserPage ← → ↻ ＋ | 无 class，unicode | `.btn-ghost` + 内联 SVG 图标（§3.2）|
| 4 | BrowserPage tab 关闭 × | `.tab button` | 保持 `.tab button`（继承，小尺寸）|
| 5 | AccountsPage「＋ 新建 Profile」 | UA 白底（G1 焦点图） | `.btn-ghost` |
| 6 | AccountsPage 重命名 | `.link-btn` | `.btn-link`（class 改名）|
| 7 | AccountsPage「Create account」 | `.primary` | `.btn-primary`（文字改「创建账号」）|
| 8 | ContentPage「Save draft」 | `.primary` | `.btn-primary`（「保存草稿」）|
| 9 | AutomationPage「Create」 | `.primary` | `.btn-primary`（「创建任务」）|
| 10 | FilesPage ＋文件 / ＋目录 / 重命名 | `.files-toolbar button` 灰样式 | `.btn-ghost` |
| 11 | FilesPage 保存 | `.primary` | `.btn-primary`（**文案保持「保存」不变**，e2e 断言）|
| 12 | FilesPage 冲突「重新加载磁盘版」/「用我的覆盖」 | `.primary` / 无 | 「重新加载磁盘版」→ `.btn-primary`；「用我的覆盖」→ `.btn-danger` |
| 13 | LogsPage ↻ / Clear | `.logs-toolbar button` 灰样式 | `.btn-ghost`（↻ 换 SVG + aria-label）|
| 14 | SettingsPage Save / Test connection | `.primary` / UA 灰 | Save→`.btn-primary`（**文案暂保「Save」**，见 §3.8 e2e 约束）；Test connection→`.btn-ghost` |
| — | AgentPanel 发送 / ■ 停止 | `.composer button` / `.stop` | 发送→`.btn-primary`；停止→`.btn-danger`（**「发送」文字必须保留**，e2e 断言）|

`.primary` class 保留为 `.btn-primary` 的别名（`.primary{...}` 一并改写实现），等 R3 全站确认无引用后再删；同理 `.composer button` 蓝底规则删除，由 `.btn-primary` 承担。

---

## 二、组件规范

### 2.1 侧栏（S1/S2/S3）

**图标**：放弃 unicode 字符（◫◎◉✜✎⌁⌗⚙ 磅重/光学尺寸不一，⌁⌗ 不识，⚙ 有 emoji 替换风险）。手写 16px 内联 SVG，stroke 1.5、`currentColor`，8 个导航图标 + brand mark，统一放 `src/renderer/components/icons.tsx`（新文件，仅此一个例外，不算「新增依赖」）。全部 24×24 viewBox、无填充、圆角线帽，可直接粘贴：

```tsx
// icons.tsx — 全部手写线性图标，stroke=currentColor，无外部依赖（S1）
const I = ({ d, extra }: { d: string; extra?: React.ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />{extra}
  </svg>
);
export const IcDashboard = () => <I d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 9h8V3h-8z" />;
export const IcBrowser   = () => <I d="M2 6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z M2 9h20" extra={<circle cx="5" cy="6.5" r="0.5"/>} />; // 窗口+顶栏
export const IcAccounts = () => <I d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-6 8-6s8 2 8 6" />; // 人形
export const IcFiles    = () => <I d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />; // 文件夹
export const IcContent = () => <I d="M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />; // 笔
export const IcAutomation = () => <I d="M12 2v3 M12 19v3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M2 12h3 M19 12h3 M4.9 19.1 7 17 M17 7l2.1-2.1 M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z" />; // 齿轮（手绘线稿，非 emoji）
export const IcLogs     = () => <I d="M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5" />; // 列表
export const IcSettings = () => <I d="M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6" />; // 滑杆组
// brand mark：方块 + C（S3）
export const BrandMark = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" fill="var(--accent)" />
    <path d="M15.5 9.2A4.8 4.8 0 1 0 15.5 14.8" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" />
  </svg>
);
```

（R3 实施时允许对个别 path 做像素级微调，但必须保持 16px / 1.5 stroke / currentColor 三不变。）

**激活态**（S2）：左侧 2px accent 竖条 + 亮字 + 微底色；文字 11px→12px：

```css
.sidebar button { border: 0; background: transparent; color: var(--text-2);
  border-radius: var(--radius-s); padding: 10px 4px; font-size: 12px;
  display: flex; flex-direction: column; gap: 6px; align-items: center; position: relative; cursor: pointer; }
.sidebar button:hover { background: var(--hover); color: var(--text); }
.sidebar button.active { background: var(--hover); color: #fff; }
.sidebar button.active::before { content: ""; position: absolute; left: 0; top: 8px; bottom: 8px;
  width: 2px; border-radius: 1px; background: var(--accent-text); } /* 左侧指示条 */
```

brand 区：`<BrandMark/>` + 文字 `CreatorOS`（替换裸文本 `C|OS`）。侧栏宽度 84px 不变。

### 2.2 输入控件暗色统一（G1）

```css
.field { width: 100%; margin: 0 0 12px; padding: 8px 12px; background: var(--bg-0);
  border: 1px solid var(--border-strong); color: var(--text); border-radius: var(--radius-s); }
.field:focus-visible { outline: 2px solid var(--accent-text); outline-offset: -1px; }
.field::placeholder { color: var(--text-3); }        /* 5.86:1 on bg-0 */
textarea.field { padding: 10px 12px; line-height: 1.5; }
```

checkbox/select 规则见 §1.2。

### 2.3 面板 / 卡片（G7 第六层灰的替代）

```css
.panel, .card { background: var(--bg-2); border: 1px solid var(--border);
  border-radius: var(--radius-l); padding: 16px;
  box-shadow: 0 1px 0 rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.18); } /* 微阴影替代第六层灰 */
```

### 2.4 空状态组件 `.empty`（A2/F2/C1/AP4）

统一结构：图标 + 一句话 + 一个主动作按钮 + （可选）快捷建议。全站四处空态共用：

```css
.empty { display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; padding: 48px 24px; text-align: center; color: var(--text-2); min-height: 200px; }
.empty svg { color: var(--text-3); }   /* 图标弱化 */
.empty b { color: var(--text); font-size: 14px; font-weight: 600; }
.empty .btn-primary { margin-top: 8px; }
```

```tsx
// components/Empty.tsx
export function Empty({ icon, title, hint, action, suggestions }: {
  icon: React.ReactNode; title: string; hint?: string;
  action?: React.ReactNode; suggestions?: string[];
}) {
  return <div className="empty">{icon}
    <b>{title}</b>
    {hint && <span>{hint}</span>}
    {action}
    {suggestions && <div className="empty-suggest">{suggestions.map(s => <button key={s} className="btn-ghost" onClick={/* 填入发送框 */}>{s}</button>)}</div>}
  </div>;
}
```

四处空态内容定义（文案）：

| 位置（审计项） | 图标 | 标题 | hint | 主动作 |
|---|---|---|---|---|
| Accounts 左栏「No profiles yet.」（A2） | IcBrowser | 还没有浏览器身份 | 身份是登录态的容器，一个账号一个身份 | `.btn-primary`「创建浏览器身份」（触发 setCreatingProfile(true)）|
| Accounts 右栏「No accounts yet.」（A2） | IcAccounts | 还没有运营账号 | 创建账号后会自动分配一个专属文件目录 | `.btn-primary`「创建第一个账号」（focus 到表单 name 输入框）|
| Files 编辑器空态（F2，现在左上一行 muted） | IcFiles | 选择左侧文件开始编辑 | CLAUDE.md 是给 Agent 的目录约定说明 | `.btn-ghost`「＋ 新文件」 |
| Content Library（C1，现在无 fallback） | IcContent | 还没有草稿 | 左侧写下第一篇，保存后出现在这里 | 无 |
| Agent 面板首开（AP4，升级现有 muted 一句话） | IcAutomation | Agent 待命中 | 内置 Agent 由 Claude Code 驱动，能操作浏览器、读写文件 | 快捷建议 chips：「检查各账号登录态」「打开小红书创作中心并截图」「列出所有定时任务」|

`Logs` 空态已有文案（「暂无日志…」），保留、套 `.empty` 样式居中。

### 2.5 徽章 / pill（G8 术语统一）

```css
.pill { height: max-content; padding: 2px 10px; background: var(--hover); color: var(--text-2);
  border-radius: 999px; font-size: 11px; }
.pill.ok   { background: color-mix(in srgb, var(--ok) 15%, var(--bg-2));  color: var(--ok); }
.pill.warn { background: color-mix(in srgb, var(--warn) 15%, var(--bg-2)); color: var(--warn); }
```

绑定状态语义全站统一：已绑定账号 → `pill 显示账号名（.pill.ok 绿系）`；未绑定 → `「未绑定」`（灰 pill），删除「空闲」「No Profile」两种叫法。content status 同理显示中文状态（草稿/已排期/已发布，见术语表）。

### 2.6 表格（Logs，L1/L2/L3）

```css
.logs-table th { position: sticky; top: 0; background: var(--bg-2); color: var(--text-2);
  font-weight: 500; padding: 8px 12px; }
.logs-table td { padding: 6px 12px; }
.logs-table tr:hover { background: var(--hover); }
.logs-time { color: var(--text-3); font-size: 11px; }  /* 4.90:1 达标（G4 原 #6f7a8c 3.93） */
.logs-table table { font-size: 12px; }
.logs-table th:nth-child(1) { width: 90px; }  /* L3：时间列窄化 */
.logs-table th:nth-child(2) { width: 80px; }  /* 级别列窄化 */
.logs-table th:nth-child(3) { width: 140px; }
.logs-table td:last-child { min-width: 320px; } /* L3：消息列保底 */
```

- 级别色点（.logs-dot）保留原四色，映射语义色：debug `--text-3`、info `--info`、warn `--warn`、error `--err`。
- `{ + }` 展开指示（L1）：改 chevron SVG + 文字。收起态 chevron 右指 `M9 6l6 6-6 6` + 「详情」，展开态 chevron 下指 `M6 9l6 6 6-6` + 「收起」，用 `.btn-link` 小按钮；meta 未展开时整行显示「▸ 详情」视觉由该按钮承担。
- ↻ 刷新按钮（L2）：改 SVG（path `M21 12a9 9 0 1 1-3-6.7M21 3v6h-6`）+ `aria-label="刷新日志"` + title。

### 2.7 Agent 步骤行（AP1/AP2/AP3）

**工具名映射表**（15 个内置 MCP 工具 + 内置文件工具；原始名收进展开后的 step-json 顶部 `code` 行保留可查）：

| 原始工具名 | 显示名 |
|---|---|
| mcp__creatoros-browser__browser_navigate | 打开页面 |
| mcp__creatoros-browser__browser_snapshot | 读取页面 |
| mcp__creatoros-browser__browser_click | 点击 |
| mcp__creatoros-browser__browser_fill | 填写 |
| mcp__creatoros-browser__browser_scroll | 滚动 |
| mcp__creatoros-browser__browser_evaluate | 执行脚本 |
| mcp__creatoros-browser__browser_upload | 上传文件 |
| mcp__creatoros-browser__browser_screenshot | 截图 |
| mcp__creatoros-browser__browser_list_profiles | 列出身份 |
| mcp__creatoros-browser__browser_list_tabs | 列出标签页 |
| mcp__creatoros-browser__browser_open_tab | 新开标签页 |
| mcp__creatoros-browser__browser_switch_tab | 切换标签页 |
| mcp__creatoros-browser__browser_back | 后退 |
| mcp__creatoros-browser__browser_forward | 前进 |
| mcp__creatoros-browser__browser_reload | 刷新 |
| Read / Write / Edit / Glob / Grep | 读文件 / 写文件 / 编辑文件 / 搜索文件名 / 搜索内容 |

```tsx
// AgentPanel.tsx 内新增映射（AP1）
const TOOL_LABEL: Record<string, string> = {
  'browser_navigate': '打开页面', 'browser_snapshot': '读取页面', 'browser_click': '点击',
  'browser_fill': '填写', 'browser_scroll': '滚动', 'browser_evaluate': '执行脚本',
  'browser_upload': '上传文件', 'browser_screenshot': '截图', 'browser_list_profiles': '列出身份',
  'browser_list_tabs': '列出标签页', 'browser_open_tab': '新开标签页', 'browser_switch_tab': '切换标签页',
  'browser_back': '后退', 'browser_forward': '前进', 'browser_reload': '刷新',
  'Read': '读文件', 'Write': '写文件', 'Edit': '编辑文件', 'Glob': '搜索文件名', 'Grep': '搜索内容',
};
const toolLabel = (tool?: string) => {
  if (!tool) return '';
  const short = tool.replace(/^mcp__creatoros-browser__/, '');
  return TOOL_LABEL[short] ?? short;
};
// StepLine 里 <span className="step-label">{step.tool}</span> 改为
// <span className="step-label">{toolLabel(step.tool)}</span>
// 展开态 step-json 顶部加一行 <code>{step.tool}</code>（原始名可查）。
```

（映射按「短名后缀」匹配，`mcp__creatoros-browser__` 前缀剥掉，未来加工具自动降级显示短名。）

**三态图标与颜色**（AP2）：

| 态 | 图标（替换现 ⚙/✓/✗/●/⚠ unicode） | 颜色 |
|---|---|---|
| 运行中 tool_start | 旋转 spinner：circle path `M12 3a9 9 0 1 0 9 9` + 动画 | `--accent-text`（6.63:1 on bg-2）|
| 成功 tool_result ok | ✓ path `M5 13l4 4L19 7` | `--ok` |
| 失败 tool_result !ok | ✕ path `M6 6l12 12M18 6L6 18` | `--err` |
| done | ● 小实心圆（保留现有语义） | `--ok` |
| error | ⚠ 换 SVG 三角 `M12 3 2 21h20z M12 10v5 M12 18v.01` | `--warn` |

header 状态字（AP2）：`运行中…` 用 `--accent-text` + 前置 6px 呼吸圆点动画；空闲 `Claude Code` 保持 `--text-2`。

**数字格式化规则（AP3）**：

```ts
const fmtCost = (v: number) => v < 0.01 ? '<$0.01' : `$${v.toFixed(2)}`;   // $0.0000 → <$0.01；≥$0.01 保留 2 位
const fmtDur  = (v: number) => v < 100 ? '<0.1s' : `${Math.round(v/100)/10}s`; // 0s → <0.1s
// StepLine: ${meta.cost.toFixed(4)} → ${fmtCost(meta.cost)}；${...}s → ${fmtDur(meta.durationMs)}
```

**step 行排版**：`.step-label` 由 monospace 11.5px 改为 13px 正常字体（中文映射后不再是代码）；`.step-time` 色 `--text-3`、11px；`.step-hint`（展开/收起）改 `.btn-link` 小按钮。

### 2.8 cron 横幅（AP5）

```css
.cron-banner { padding: 8px 15px; font-size: 12px;
  background: color-mix(in srgb, var(--accent) 15%, var(--bg-1));
  color: var(--accent-text); border-bottom: 1px solid var(--border);
  display: flex; align-items: center; gap: 8px; }
.cron-banner .btn-link { color: var(--accent-hover-text); }
```

```tsx
{cronRun && <div className="cron-banner">
  <span>定时任务「{cronRun.source.slice('cron:'.length)}」运行中…</span>
  <button className="btn-link" onClick={() => void window.creatorOS.agent.stop(cronRun.runId)}>停止</button>
</div>}
```

去掉 ⏱ emoji 与英文「Cron job」；「停止」直接调 `agent.stop(runId)`（IPC 已存在：AGENT_STOP）。

### 2.9 Toast（C3，最小实现）

保存草稿/账号创建等成功反馈用右上角 3s 自动消失条（不引入依赖，纯 CSS 动画）：

```css
.toast { position: fixed; top: 16px; right: 16px; z-index: 50; background: var(--bg-2);
  border: 1px solid var(--ok); color: var(--ok); border-radius: var(--radius-s);
  padding: 8px 14px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
  animation: toast-in 120ms ease; }
@keyframes toast-in { from { opacity: 0; transform: translateY(-4px); } }
```

---

## 三、各页面改造定义

### 3.0 全站布局基础（G5 下半屏空白总纲）

```css
.page { height: 100%; padding: 24px; overflow: auto;
  display: flex; flex-direction: column; gap: 24px; }          /* gap 替代 22/24 漂移（G9）*/
.content-grid { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1.3fr);
  gap: 16px; margin: 0; flex: 1; min-height: 0; }             /* G5：拉满剩余高度 */
.content-grid > .panel { overflow: auto; min-height: 0; }     /* panel 内部自己滚 */
```

每页统一「h1 + 一句副描述 + 工具栏/内容」（D3）：

```tsx
<div className="page">
  <header><h1>标题</h1><p className="muted">副描述一句话</p></header>
  ...工具栏 / content-grid...
</div>
```

### 3.1 Dashboard（D1/D2/D3）

**现状**：4 张「1」数字卡 + System guarantees 技术段落，对运营者零价值，卡片下 235,200px 空白。

**数据源核对结论（重要）**：`agent_runs` 与 `job_runs` 表都存在且有真实写入（claudeAgent.ts:173/202、Scheduler.ts:22/43/45），但 **registerIpc.ts 没有任何读取这两个表的 IPC**——现有 `app:state` 只带 platforms/accounts/profiles/tabs/contents/jobs。因此本页需要 **R3 新增 IPC**（契约见下）。

**新 IPC 契约**（`agent.runs.list`，四处同步照 R2 清单）：

```ts
// shared/types.ts 新增
export type AgentRunSummary = { id: string; status: string; source: string;
  prompt: string; ok: boolean; costUsd: number | null; durationMs: number | null;
  startedAt: number; finishedAt: number | null };
export type JobRunSummary = { id: string; jobId: string; jobName: string;
  status: string; startedAt: number; finishedAt: number | null; error: string | null };

// shared/ipc.ts 新增
AGENT_RUNS_LIST: 'agent:runs.list',
// preload.cts 新增
runsList: (limit?: number) => invoke<{ agentRuns: AgentRunSummary[]; jobRuns: JobRunSummary[] }>(IPC.AGENT_RUNS_LIST, limit ?? 10),
// registerIpc.ts 新增（input_json 里有 {prompt, source}，见 claudeAgent.ts:173 实测写入形状）
ipcMain.handle(IPC.AGENT_RUNS_LIST, (_e, limit = 10) => ({
  agentRuns: rawSqlite().prepare(
    `SELECT id, status, input_json, cost_usd, duration_ms, started_at, finished_at
     FROM agent_runs ORDER BY started_at DESC LIMIT ?`).all(limit)
    .map((r: any) => { const input = JSON.parse(r.input_json);
      return { id: r.id, status: r.status, source: input.source ?? 'chat', prompt: input.prompt ?? '',
        ok: r.status === 'success', costUsd: r.cost_usd, durationMs: r.duration_ms,
        startedAt: r.started_at, finishedAt: r.finished_at }; }),
  jobRuns: rawSqlite().prepare(
    `SELECT jr.id, jr.job_id, jr.status, jr.started_at, jr.finished_at, jr.error, j.name AS job_name
     FROM job_runs jr LEFT JOIN jobs j ON j.id = jr.job_id
     ORDER BY jr.started_at DESC LIMIT ?`).all(limit)
    .map((r: any) => ({ id: r.id, jobId: r.job_id, jobName: r.job_name ?? '(已删除)', status: r.status,
      startedAt: r.started_at, finishedAt: r.finished_at, error: r.error })),
}));
// global.d.ts 同步加类型（agent.runsList）
```

**新内容结构**（运营向，全部数据源已确认存在）：

```
┌ 欢迎区：h1「工作台」+ 副描述「下午好，{当前身份名} · 共 {n} 个账号在线运营」
├ 4 张统计卡（数字 + 中文副标题 + 可对比的次行）：
│   浏览器身份数（副行：{绑定账号数}/{总数} 已绑定）
│   运营账号数（副行：{平台数} 个平台）
│   草稿总数（副行：{今天新建} 篇今日新增）
│   启用中定时任务（副行：最近一次 {相对时间}）
│   —— 数字 32px 保留、加 13px --text-2 副行，h1 弱化为 28px 常规字重（D2）
├ 最近 Agent 运行（.panel，flex:1）：agent_runs 最近 10 条
│   行：状态图标 + prompt 前 60 字 + 相对时间 + 成本/时长（fmtCost/fmtDur 复用 §2.7）
│   空态：Empty 组件「还没有 Agent 运行记录」hint「在右侧面板给 Agent 下第一条指令」
├ 最近定时任务运行（.panel，flex:1）：job_runs 最近 5 条
│   行：任务名 + 状态（成功/失败 pill）+ 相对时间 + 耗时
│   空态：Empty「还没有定时任务运行记录」hint「到「自动化」页创建第一个定时任务」+ 主动作按钮跳转
└ 快捷入口（.panel 或行内 chips）：「新建草稿」「新建定时任务」「打开浏览器」——每个 chip 跳对应页
```

- 删除「System guarantees / persist: partitions / BrowserKernel」整段（D1）。
- `.cards` 改 2×2（`grid-template-columns: repeat(4,1fr)` 在 1440 下保留 4 列亦可，R3 视觉验收定；卡片本身加副行后信息密度已够）。媒体查询里 `repeat(2,1fr)` 保留。
- 布局改为 cards + 两列 grid（agent 运行 / job 运行各一列）+ 快捷入口，flex 链拉满：`.page{display:flex}` + `.content-grid{flex:1}`（G5 Dashboard 死区）。

### 3.2 BrowserPage（B2/B3/B4/B5）

**顶栏重排（B4）**：`[←][→][↻] [地址栏 flex:1] [＋ 新标签] [头像位: 身份下拉][＋ 身份]`

```tsx
<div className="browser-top">
  <button className="btn-ghost" aria-label="Back"    onClick={...}><IcBack/></button>
  <button className="btn-ghost" aria-label="Forward" onClick={...}><IcForward/></button>
  <button className="btn-ghost" aria-label="Reload"  onClick={...}><IcReload/></button>
  <form onSubmit={...}><input aria-label="Address" placeholder="输入网址或搜索，回车打开" value={url}/></form>
  <button className="btn-ghost" aria-label="New tab" onClick={...}><IcPlus/></button>
  <select aria-label="Active profile" value={...} onChange={...}>{profiles}</select>
  <button className="btn-ghost" title="新建浏览器身份" aria-label="New profile" onClick={()=>setCreating(true)}>＋ 身份</button>
</div>
```

- B3：「＋P」→「＋ 身份」，title 补「新建浏览器身份」。**e2e 依赖 `aria-label="New profile"` 与 `.browser-top-input`，保留不变**。
- 导航组图标（SVG path，进 icons.tsx）：Back `M15 6l-6 6 6 6`；Forward `M9 6l6 6-6 6`；Reload `M21 12a9 9 0 1 1-3-6.7M21 3v6h-6`；Plus `M12 5v14M5 12h14`；关闭 × `M6 6l12 12M18 6L6 18`。
- B5：占位 `.browser-placeholder` 文案「Embedded WebContentsView」→「输入网址开始浏览」；背景保持浅色（内嵌网页可见后即被盖住），文字色配浅底即可。
- 地址栏 placeholder：见上（B5 群组）。
- tabs 与内容区边界：`.tabs { border-bottom: 1px solid var(--border); }`（B4 active tab 压白页无分隔线）。
- **B2 修正确认（源码+实测核对）**：`TabManager.ts:63` 已有 `did-stop-loading → tab.loading=false`，实时实测（真实运行 app，navigate example.com / 失败导航两种）loading 均正确落回 false，`did-navigate` 也更新 url。审计截图里的常驻 ● 更可能是**审计当时 tab title 一直停在 'New Tab'（页面未加载成功）+ loading 前缀 `● ` 是文本拼接**这两件事叠加的观感。R3 修复点改为：
  1. loading 指示从「标题文本前缀 `● `」改为 tab 左侧 6px `--accent-text` 小圆点元素（结构化，不再依赖文本拼接）；
  2. `New Tab` 初始标题改为「新标签页」；
  3. 保留 did-stop-loading 逻辑不动（勿按审计原文重复修，已存在）。

### 3.3 AccountsPage（A1/A2/A3/A4）

- h1 `Accounts & Profiles` → **「账号与身份」**，副描述「每个运营账号可绑定一个浏览器身份，登录态永久保存在身份里，不在 Agent 对话里。」（A1/G8）
- 左栏 h2 `Browser Profiles` → **「浏览器身份」**；说明段改短（A4 寡行孤字）：「一个身份一个登录态。可在「浏览器」页右上角快捷新建。」（max-width 60ch 兜底：`p.muted{max-width:60ch}`）
- 列表项副行（A1）：`{p.platform??'general'} · 绑定账号：{name} · 分区 <code>` → `{平台中文名或「通用」} · 绑定账号：{账号名}`；partition 收进 title/tooltip（鼠标悬停显示 `分区 persist:…`），不再平铺。未绑定 → `· 未绑定`。
- pill（A1/G8）：已绑定显示账号名 `.pill.ok`；未绑定统一 `「未绑定」` 灰 pill。删「空闲」「No Profile」。
- 「＋ 新建 Profile」→ **「＋ 新建身份」**（.btn-ghost）。
- 右栏 h3 `New account` → **「新建账号」**；`Create account` → **「创建账号」**（.btn-primary）；`Managed accounts` → **「已有账号」**；`No profile yet` → **「暂不绑定身份」**。
- A3 校验：name 为空时「创建账号」按钮 `disabled` + 下方 `err-msg`「请先填写账号名」。
- 右栏账号列表项副行加平台 badge（`{平台名}` pill）。
- 空态：两处换 §2.4 Empty 组件（文案见表）。
- G5：`content-grid` 面板高度拉满（§3.0 通用规则），列表超出 panel 内部滚动。

### 3.4 FilesPage（F1/F3/F4/F5）

- F1：工具栏右侧 `目录：accounts/62.JAej…` → `账号：{平台名 · 账号名}`；内部 ID 移到该元素 `title`（tooltip 显示 `accounts/{id}`）。**e2e 用 `select[aria-label="Account"]` 选账号，select 的 aria-label 不动；option 文案已经是「平台 · 账号名」，保留。**
- F3：`Tree height={600}` 硬编码 → 容器 ref + ResizeObserver：

```tsx
const treeWrapRef = useRef<HTMLDivElement>(null);
const [treeH, setTreeH] = useState(0);
useEffect(() => {
  const el = treeWrapRef.current; if (!el) return;
  const ro = new ResizeObserver(() => setTreeH(Math.max(100, el.clientHeight - 4)));
  ro.observe(el); return () => ro.disconnect();
}, []);
// .files-tree 自身不再 overflow:auto（Tree 内部滚），改 display:flex; min-height:0
// <div className="files-tree" ref={treeWrapRef}> <Tree ... height={treeH || 100} .../> </div>
// files-grid: grid-template-columns: 280px minmax(0,1fr); files-tree 与 files-editor 均 min-height:0
```

（react-arborist 的 `height` 必须是数字，用 `treeH||100` 初值避免 0 渲染；页面 grid 已是 `1fr` 行，树面板随窗口伸缩。）

- F4：`📄 ▾ ▸` → icons.tsx 的 `IcFiles`（文件夹）+ 文件图标 `IcFile`（path `M6 2h8l4 4v16H6z M14 2v4h4`）；▸▾ 用 chevron（§2.6 的两条 path）。
- F5：新建/重命名内联输入行不再插在工具栏与 grid 之间（消除布局跳动）：改为**浮在工具栏正下方的单行条** `position: relative` 容器内 `absolute` 定位（不挤压 grid）；`onBlur` 只取消不提交——`commitCreating` 的触发只留 Enter，onBlur 改 `setCreating(null)`。**注意 e2e 依赖 `.files-creating input` + Enter 提交 + `.files-toolbar button:has-text("＋文件")`——保留 class、保留 Enter 行为；「＋文件」「＋目录」「重命名」「保存」按钮文案全部不动。**
- 空目录文案「空目录 — 用上方按钮创建第一个草稿…」套 `.empty`。
- 编辑器空态居中换 §2.4 Empty（F2）。
- h1 `Files` → **「文件」**（副描述「每个账号一个专属目录，Agent 与你共用同一份文件。」）。**e2e `sidebar button:has-text("Files")` 断言的是侧栏**——侧栏标签中文化后必须同步改 e2e（见 §5.1）。

### 3.5 ContentPage（C1/C2/C3）

- h1 `Content` → **「内容」**（副描述「撰写与沉淀各平台草稿。」）。
- 左栏 h2 `New draft` → **「新建草稿」**；`Save draft` → **「保存草稿」**（.btn-primary）；placeholder：Title→「标题」、Body→「正文…」、Unassigned account→「不关联账号」。右栏 h2 `Library` → **「草稿库」**。
- C3 校验：标题为空点保存 → 按钮不 disabled（允许无题草稿是既有行为），但改为存「无标题草稿」而非「Untitled」，保存成功后 toast「已保存草稿」并在右栏高亮新条目 2s（`.content-item.flash{outline:1px solid var(--accent-text)}`）。
- C2 列表项：加平台 pill（中文平台名）、更新时间 `--text-3` 11px；`body.slice(0,100)` → 截断加 `…`：`body.length>100? body.slice(0,100)+'…' : body`。
- C1 空态：Empty 组件（文案见 §2.4 表）。
- 状态 pill 中文化：draft→草稿、idea→灵感、scheduled→已排期、published→已发布、archived→已归档（G8）。

### 3.6 AutomationPage（U1/U2/U3）

- h1 `Automation` → **「自动化」**（副描述「用 cron 定时执行打开页面或 Agent 任务。」）。
- h2 `Create cron job` → **「新建定时任务」**；表单 label 化（placeholder 改 label+placeholder 双层，字段名中文）：Job name→「任务名」placeholder「如：每天早上打开创作中心」；Cron→「执行周期」。
- **U2 cron 输入升级**：select 模板下拉（「每天 09:00」`0 9 * * *`、「每小时」`0 * * * *`、「每周一 09:00」`0 9 * * 1`、「自定义」）+ 自定义时显示原始 cron input + **下次运行时间预览**。预览实现（无新依赖，纯函数进 vitest）：

```ts
// shared/cronNext.ts —— 计算 cron 下次触发（仅支持标准 5 段，分钟粒度向前暴力枚举 ≤366 天，366*24*60 次循环上限）
export function nextCronDate(expr: string, from = new Date()): Date | null;
```

- **U1 Job 删除**：源码核对——`jobs.delete` IPC **不存在**（ipc.ts 无、preload 无、registerIpc 无、repo 无 deleteJob），Gateway 也没有 DELETE /api/jobs/:id。R3 新增契约：

```ts
// shared/ipc.ts
JOB_DELETE: 'job:delete',
// preload.cts: jobs.delete:(id:string)=>invoke(IPC.JOB_DELETE,id)
// repository.ts 新增
deleteJob(id: string) { db.delete(jobs).where(eq(jobs.id, id)).run(); },
// registerIpc.ts
ipcMain.handle(IPC.JOB_DELETE, (_e, id: string) => {
  rawSqlite().prepare('DELETE FROM job_runs WHERE job_id = ?').run(id); // 历史运行一并清理
  repo.deleteJob(id); scheduler.reload(); changed();
});
// global.d.ts: jobs.delete 同步
```

UI：每个 Job 行尾加 `.btn-danger` 图标按钮（垃圾桶 SVG path `M3 6h18 M8 6V4h8v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6`）+ `aria-label={删除任务 {name}}`；点击先出行内确认（按钮变红字「确认删除？」再点一次才执行，3s 不点恢复——不引入 confirm 模态）。
- Jobs 列表项：workflowType 中文映射：browser.navigate→定时打开页面、agent.run→执行 Agent 任务、demo→演示任务（G8）；`enabled` label 改「启用」+ checkbox accent-color。
- U3：选 agent.run 时 textarea rows 5→12 且该 panel 内表单区展开（左栏 panel `grid-row: span 2` 或独立全宽行，R3 实施取简单路径：agent.run 选中时表单部分占满左栏高度，textarea flex:1）。
- G5：Jobs 面板拉满（§3.0）。

### 3.7 LogsPage（L1/L2/L3）

- h1 `Logs` → **「日志」**（副描述「应用与 Agent 的运行记录，2 秒自动刷新。」）。
- 工具栏：「全部级别/全部模块/搜索消息…」保留；「自动刷新(2s)」保留；↻→SVG+aria-label「刷新」；`Clear` → **「清空」**（.btn-ghost）。
- 表头已是中文（时间/级别/模块/消息）保留；列宽与消息列 min-width 见 §2.6（L3）。
- `{ + }` → chevron+「详情」（L1，§2.6）。
- `.logs-table` 的 `max-height:calc(100vh - 220px)` 改 `flex:1; min-height:0`（进入 .page flex 链，G5）。

### 3.8 SettingsPage（T1/T2/T3）

- h1 `Settings` → **「设置」**（副描述现有 muted 段落保留：「内置 Agent 引擎为 Claude Code…保存即热生效。」）。
- **e2e 硬约束（settings.spec.ts:120 断言 `ui.title).toBe('Settings')`）**：标题中文化会挂 gate。**定案：Settings 页 h1 保持英文「Settings」**，中文语义由副描述承担；或 R3 同步改 e2e 断言为「设置」。本文档选后者并列入 §5.1 同步清单（与侧栏中文化一起一次改完）。若 R3 想零 e2e 改动，退路是保「Settings」。
- T1 修复见 §1.6（删 `.row button`，Save 恒蓝）。
- T2：超长 placeholder 拆分——placeholder 一句话，说明移到字段下 help 行：

| 字段 | placeholder | 下方 help（--text-3 12px）|
|---|---|---|
| Base URL | `https://api.anthropic.com（默认）` | 公司网关地址填这里；留空走官方 |
| Auth Token | `Auth Token（可选）` | → ANTHROPIC_AUTH_TOKEN（Bearer）；与 API Key 二选一，Token 优先 |
| API Key | `API Key（可选）` | → ANTHROPIC_API_KEY（x-api-key）；与 Token 二选一，Token 优先 |
| Model | `如 claude-sonnet-4-5` | 留空用默认模型 |

（字段英文名与 ANTHROPIC_* 变量名是技术字段，按 §0 策略保留英文。**e2e 顺序约束**：settings.spec.ts:99-100 按 `inputs[0]`=Base URL、`inputs[3]`=Model 的 DOM 顺序填写——四个 `.field` 输入框的顺序（Base URL→Token→API Key→Model）不得调整。）
- T3：Model 字段加 `<datalist id="model-list">`（常用候选：claude-sonnet-4-5、claude-opus-4-6、claude-haiku-4-5 + 当前真实值）+ blur 校验（空值合法）。
- 「Test connection」→**「测试连接」**、`Testing…`→「测试中…」、Save→「保存」。**settings.spec 依赖 `byText('.page button','Save')` 与 `'Test connection'`**——列入 §5.1 同步清单。
- 右栏「引擎说明」四条 muted 保留（已是中文）。
- **e2e 硬约束二（settings.spec.ts:89 断言 `.page input.field` 数量 ≥4）**：R3 不得在 Settings 页减少 input.field 数量（只增不减）。

### 3.9 AgentPanel（AP4/AP5 及通用）

- header：`<b>Agent</b><span>` 保留结构；`运行中…` accent 化（§2.7）。
- 空态升级为 suggestion chips（§2.4 表，点击填入 composer）。
- cron 横幅（§2.8）。
- composer placeholder 保留（已是中文）；「发送」「停止」按钮 class 见 §1.6 表。

### 3.10 最终文案总表（每页）

| 页 | h1（侧栏标签） | 副描述 |
|---|---|---|
| dashboard | 工作台（工作台） | 下午好，{身份名} · {n} 个账号在线运营 |
| browser | 浏览器（浏览器） | （无副描述，顶栏即内容） |
| accounts | 账号与身份（账号） | 每个运营账号可绑定一个浏览器身份，登录态保存在身份里 |
| files | 文件（文件） | 每个账号一个专属目录，Agent 与你共用同一份文件 |
| content | 内容（内容） | 撰写与沉淀各平台草稿 |
| automation | 自动化（自动化） | 用 cron 定时执行打开页面或 Agent 任务 |
| logs | 日志（日志） | 应用与 Agent 的运行记录 |
| settings | 设置（设置）* | 内置 Agent 引擎为 Claude Code，配置保存即热生效 |

\* settings.spec 断言 h1 文本 'Settings'——选「设置」需同步改 e2e（§5.1）；文案表按中文终态给。

侧栏标签（Sidebar button 文字，S1 图标见 §2.1）：工作台 / 浏览器 / 账号 / 文件 / 内容 / 自动化 / 日志 / 设置。**改侧栏文案必挂 4 处 e2e**（`.sidebar button:has-text("Files")`×2、`byText('.sidebar button','Settings')`、`byText('.sidebar button','Browser')`），全部列入 §5.1 同步清单。

---

## 四、术语表（G8）

| 概念 | 统一叫法 | 禁用叫法 | 出现位置 |
|---|---|---|---|
| BrowserProfile | 浏览器身份（UI）/ Profile（技术字段） | 浏览器配置文件、＋P、分区 | Accounts、Browser |
| Account | 运营账号（UI）/ 账号 | 账户、Social account | 全站 |
| partition | 分区（仅 tooltip/详情） | persist:xxx 直出列表 | Accounts |
| Job | 定时任务 | cron job、Cron Job | Automation、Dashboard |
| job run | 任务运行 | job_run | Dashboard |
| agent run | Agent 运行 | run | Dashboard、Agent 面板 |
| Content | 草稿（draft）/ 内容（页面名）/ 草稿库（Library 区） | Library、作品 | Content |
| status: draft/scheduled/published | 草稿/已排期/已发布 | 英文状态直出 | Content pill |
| workflowType: browser.navigate / agent.run / demo | 定时打开页面 / 执行 Agent 任务 / 演示任务 | 原始枚举直出 | Automation |
| 未绑定身份 | 未绑定 | 空闲、No Profile | Accounts |
| tab | 标签页 | New Tab | Browser |
| cron 表达式 | 执行周期 | Cron (e.g. 0 9 * * *) | Automation |
| 新标签页初始标题 | 新标签页 | New Tab | Browser |
| Agent 消息 | 指令（用户输入）/ 回复（助手输出） | prompt（UI 层） | Agent 面板 |

---

## 五、工程约束（R3 硬边界）

### 5.1 e2e 选择器契约

**保留不动（改 class/文案会挂 gate）**：`.browser-top button[aria-label="New profile"]`、`.browser-top-input`、`.composer textarea`、`.composer button:has-text("发送")`、`.files-creating input`、`.files-editor .cm-content`、`.files-editor-top`、`.files-editor-top button:has-text("保存")`、`.files-toolbar button:has-text("＋文件")`、`.files-tree`、`.chat`、`.composer`、`.agent`、`.app`、`.page`、`.ok-msg`、`.err-msg`、`.test-detail`、`.step`、`.step-json`、`.field`、`input.field`、`select[aria-label="Account"]`、`.content-item`（未断言但广泛使用，保留）、`.pill`、`.tab`、`.files-row`。

因此 **BrowserPage 的 aria-label 保持英文**（New profile/Back/Forward/Reload/New tab/Address/Active profile），FilesPage 的「＋文件/＋目录/重命名/保存」按钮文案、FilesPage select aria-label="Account"、composer「发送」全部不动。

**规范内显式声明「同步改 e2e」的断言**（R3 必须一并改，否则 gate 红）：

| spec 位置 | 现断言 | 改为 |
|---|---|---|
| settings.spec.ts:120 | `ui.title).toBe('Settings')` | `'设置'` |
| settings.spec.ts:103/109 | `byText('.page button','Save')` / `'Test connection'` | `'保存'` / `'测试连接'` |
| files.spec.ts:27/68 | `.sidebar button:has-text("Files")` ×2 | `:has-text("文件")` |
| settings.spec.ts:83/116 | `byText('.sidebar button','Settings')` / `'Browser')` | `'设置'` / `'浏览器'` |

不变项核对说明：launch.spec.ts:50 的 `aria-label="New profile"` 保留英文（§5.1 上节），按钮可见文字改「＋ 身份」不影响该断言；settings.spec.ts:89 的 `.page input.field` 数量 ≥4 只要 R3 不删输入框即安全（本规范只加 datalist/help，不删 input）；files.spec.ts:61 断言 `.files-editor-top` 含「已保存」，SaveState 文案不动。

其他不变项：CSS 仍是单文件 `src/renderer/styles/app.css`（禁 CSS-in-JS/tailwind；允许 @layer 不强制）；**不新增任何 npm 依赖**（图标手写 SVG，cron 预览手写枚举，不用 lucide-react/cron-parser）；React 19 + 严格 TS；新增 IPC 四处同步（ipc.ts 常量 / preload.cts / registerIpc / global.d.ts，R2 清单）。

**`.row button` 特异度（T1）定案**：删 `.row button` 规则（§1.6），SettingsPage 两按钮直接用 `.btn-primary`/`.btn-ghost`；若 R3 阶段 grep 发现其他依赖，回退方案 `.row .btn-primary` 显式覆盖。

### 5.2 视觉验收截图清单（fuyao-coding 对图用，WORKFLOW_CN UI Gate）

R3 完成后截 14 张（1440×900，同 R0 取景）：

1. `01-browser.png` 浏览器页（example.com 加载完成 + loading 点已消）
2. `01b-browser-creating.png` ＋ 身份内联输入展开态
3. `02-dashboard.png` 工作台（含 agent_runs/job_runs 各 ≥1 条数据——用 fake 模式跑一轮 chat + 触发一次 job 先造数据）
4. `03-accounts.png` 账号与身份页（含一处已绑定 + 一处未绑定 pill）
5. `03b-accounts-empty.png` 双空态
6. `04-files.png` 文件页（树 ResizeObserver 生效，矮窗口树不被裁）
7. `05-files-editor.png` 编辑器打开 + 保存按钮蓝
8. `06-content.png` 内容页（含 1 条草稿带时间/pill + Library 空态另截）
9. `07-automation.png` 自动化（含 cron 模板下拉展开 + 下次运行预览 + 删除确认态）
10. `08-logs.png` 日志（含 warn/error 行、详情展开态）
11. `09-settings.png` 设置（Save 蓝色、Test connection 灰、help 文案行）
12. `10-agent-running.png` 运行中（spinner + 中文工具名 + cron 横幅另截）
13. `11-agent-done.png` 完成（<$0.01 / <0.1s 格式）
14. `12-native-controls.png` settings/accounts 四角放大对比（checkbox/select 无 UA 白底）

---

## 六、验收标准（R3 AC 清单）

每条可机械验证（grep/脚本/e2e）或可截图验证。覆盖 Top5 审计群全部 46 项（B1 已撤销，不出现）。

**Token 与对比度**

- AC-对比度（G4/G7/G10）：§1.1 对比度表全数复算 ≥4.5:1（脚本重算一遍入 docs/specs/ 对比度附录或 R3 自测记录）；全站文字色只有 --text/--text-2/--text-3/--accent-text/--ok/--warn/--err/--info 八种，grep `app.css` 无 `#5b6575|#67718a|#6f7a8c|#7f8999|#8993a5|#8e98a8|#747c8d` 旧值。
- AC-G7-三层：`grep -o '#[0-9a-f]\{6\}' app.css` 输出的背景类色值 ⊆ {bg-0,bg-1,bg-2,hover,5 个 tint 字面值,white/网页区}，不存在第 4 层近灰。
- AC-G1：截图 12 号无 UA 白底控件（checkbox、select 展开列表、「＋ 身份」按钮全暗色）；`app.css` 首行 `color-scheme: dark`。

**按钮系统**

- AC-G3-按钮收敛：`grep '<button' src/renderer` 每处的 className ∈ {btn-primary, btn-ghost, btn-danger, btn-link, tab button, sidebar button}，无裸 button 无 class（含 UA 默认态）；CSS 中 height 只有 32px 一种按钮高度（`--btn-h`）。
- AC-G2：`button:hover`/`:active`/`:disabled` 规则存在且 grep 页面可截图验证任一按钮按下有明暗反馈。
- AC-T1：Settings 页截图：Save 蓝底白字、测试连接灰底，两按钮视觉可分。
- AC-G10：`#6f8cff` 不再出现于 app.css。

**版式与间距**

- AC-G6：`grep 'font-size' app.css` 值 ⊆ {28,20,16,13,12,11}px（12 仅限侧栏/step 例外已声明）；h3 渲染 16px ≥ 正文。
- AC-G9：`grep -E '1[018]px|22px|14px' app.css` 无 margin/gap 单发值（14px 允许出现在 padding:14px 的 chat 区或圆角外——R3 以最终 CSS 审查记录为准，原则：间距只有 4/8/12/16/24/32）。

**页面**

- AC-G5：1440×900 下 02/03/06/07/09 各页截图，panel 底边距视口底 ≤80px（无 ≥130px 纯背景死区，R0 的 4 处像素死区全部消除）。
- AC-D1：Dashboard 截图含「最近 Agent 运行」「最近定时任务运行」两个列表（agent_runs/job_runs 真实数据）；`persist:`/`BrowserKernel` 字样不再出现在页面。
- AC-B3：浏览器页截图按钮可见文字为「＋ 身份」，title=「新建浏览器身份」。
- AC-B2：导航 example.com 完成后截图 tab 无 loading 圆点；e2e 断言 `state.tabs.every(t=>!t.loading)` 可加进 browser.spec。
- AC-B5：占位区无「Embedded WebContentsView」字样（grep 渲染源码确认）。
- AC-F1：Files 工具栏右侧显示账号名，无 `accounts/` + ID 直出（截图 + grep `目录：accounts`）。
- AC-F3：矮窗口（700px 高）截图树完整、底部无露底带；e2e 可加断言 `.files-tree` clientHeight 跟随容器。
- AC-F4/G6-文件：树与图标全部 SVG（grep `📄|▸|▾` 渲染源码为 0）。
- AC-S1：侧栏截图全 SVG 图标；grep 渲染源码无 `◫|◎|◉|✜|✎|⌁|⌗|⚙` unicode；⚙ emoji 风险消除。
- AC-S2：激活态截图含 2px accent 左指示条；侧栏字 12px。
- AC-S3：品牌区截图有 SVG mark。
- AC-AP1：Agent 步骤行截图显示中文工具名；展开态 step-json 内保留原始名 code 行。
- AC-AP2：运行中 header 截图状态字为 accent 色系。
- AC-AP3：完成行 `$0.0000/0s` → `<$0.01/<0.1s`（截图 + `grep toFixed(4)` 渲染源码为 0）。
- AC-AP5：cron 横幅截图为蓝系、含「停止」按钮；grep 渲染源码无 ⏱。
- AC-U1：创建一个 job → 点删除 → 确认 → job 消失（e2e 新增：gateway 或 IPC 造 job 后 UI 删除，断言 `creatorOS.state()` jobs 数量减 1）。
- AC-U2：cron 模板下拉截图 + 下次运行时间预览文字。
- AC-L1/L2：日志截图 chevron+「详情」、刷新按钮有 aria-label（grep `aria-label="刷新"`）。
- AC-T2：Settings 截图 placeholder 一行内，字段下有 help 行。
- AC-A2/F2/C1/AP4：四处空态截图均含图标+标题+（该有的）主动作按钮。

**术语与文案**

- AC-G8：`grep -E 'No profiles yet|No accounts yet|No Profile|空闲|Untitled|New Tab|Embedded WebContentsView|Library|New draft|Save draft|Create account|Create cron job|Job name|Target URL|Clear' src/renderer` 命中 0（Library 作为 h2 改「草稿库」亦 0）。
- AC-术语：§3.10 文案表逐页截图核对。

**工程与回归**

- AC-e2e：`npm run gate` 全绿（含 §5.1 列出的 6 处 e2e 同步修改）；`npm run gate:fast` 绿。
- AC-IPC：`agent:runs.list`、`job:delete` 四处同步（grep ipc.ts/preload.cts/registerIpc.ts/global.d.ts 各命中 1）。
- AC-无新依赖：`package.json` diff 无新增 dependencies。
- AC-B1-撤销确认：本规范不包含地址栏状态修复项（B1 不在 AC 清单）。

---

## 七、R2 架构变更说明

- 核对基线：2026-09-22 全量源码逐行核对（registerIpc.ts / db/index.ts / schema.ts / repository.ts / Scheduler.ts / Gateway.ts / preload.cts / global.d.ts / ipc.ts / types.ts，并读 node-cron dist 验证匹配语义）。
- 按 WORKFLOW_CN §3 R2 清单七项落笔；与 R1 §3.1/§3.6 契约出入处以本节修正版为准，逐条注明「覆盖 R1 §x」。

### 7.1 分层：改动落点（清单 1）

| 层 | 文件 | 改动 |
|---|---|---|
| renderer | pages/Dashboard.tsx | 整页重写；挂载时自取 `agent.runsList()`（App.tsx 按页条件渲染，切页即重挂载天然刷新，**无需新事件订阅**） |
| renderer | pages/BrowserPage / AccountsPage / FilesPage / ContentPage / AutomationPage / LogsPage / SettingsPage.tsx | 按 §3.2–§3.8 改文案/结构/class |
| renderer | components/Sidebar.tsx、AgentPanel.tsx | 图标引用、cron 横幅、toolLabel/fmt 函数改 import |
| renderer | components/icons.tsx（新）、components/Empty.tsx（新） | §2.1 / §2.4 |
| renderer | styles/app.css | token/按钮/空态全部样式改动（仍是单文件） |
| renderer | App.tsx | **不动** |
| shared | cronNext.ts（新）、format.ts（新） | §7.7；format.ts 覆盖 R1 §2.7「AgentPanel.tsx 内新增」的落点 |
| shared | ipc.ts、types.ts | 2 常量 + 3 类型（§7.2） |
| preload | preload.cts | 2 常量 + 2 方法（§7.2） |
| main | ipc/registerIpc.ts | 2 handler + 新增 import rawSqlite + jobsLog（§7.2/§7.6） |
| main | db/repository.ts | 1 方法 deleteJob（§7.3） |
| main | gateway/、agent/、scheduler/、main.ts | **不动**（§7.4/§7.5） |

### 7.2 IPC：两个新通道的四处同步（清单 2）

先核对结论：`agent:runs.list` 与 `job:delete` 现有面确认不存在（ipc.ts / preload.cts / registerIpc.ts / repository.ts / Gateway.ts 逐一核对）。`rawSqlite()` 真实存在（db/index.ts:75 导出，Scheduler.ts:4 已 import 使用），但 **registerIpc.ts 目前没有 import 它**——R1 §3.1 的 handler 片段隐含了这行 import，R3 需补。

| 文件 | 已有模式 | 新增行 |
|---|---|---|
| src/shared/ipc.ts | job 块（19-21 行）、agent 块 `AGENT_RUN/AGENT_STOP`（22-23 行） | `JOB_DELETE: 'job:delete'` 接 JOB_TOGGLE 后；`AGENT_RUNS_LIST: 'agent:runs.list'` 接 AGENT_STOP 后 |
| src/preload/preload.cts | 本地 IPC 常量表（3-18 行，与 shared/ipc.ts 双份维护）+ 按域分组 expose | 常量表加 2 行；`agent:{…}` 块内加 `runsList:(limit?:number)=>invoke<AgentRunsOverview>(IPC.AGENT_RUNS_LIST,limit??10)`；`jobs:{…}` 块内加 `delete:(id:string)=>invoke(IPC.JOB_DELETE,id)` |
| src/main/ipc/registerIpc.ts | 单行 `ipcMain.handle(IPC.X,(_e,…)=>{…;changed();})` 薄句式（如 JOB_TOGGLE）；模块级 `logger.child` 先例 filesLog（52 行） | 2 个 handler（修正版契约见下）+ `import { rawSqlite } from '../db/index.js'` + `const jobsLog = logger.child('jobs')` |
| src/renderer/global.d.ts | 顶部从 shared/types import 类型 + 按域分组 | import 加 `AgentRunSummary, JobRunSummary, AgentRunsOverview`；`agent:{…}` 加 `runsList:(limit?:number)=>Promise<AgentRunsOverview>`；`jobs:{…}` 加 `delete:(id:string)=>Promise<void>` |

修正版契约（**覆盖 R1 §3.1/§3.6 的版本**）：

- shared/types.ts：AgentRunSummary / JobRunSummary 字段照 R1 不变——已逐列核对 schema.ts，`agent_runs.cost_usd`(REAL 可空)/`duration_ms`(INTEGER 可空)/`input_json`(TEXT)/`started_at`(INTEGER) 与 `job_runs.job_id/status/started_at/finished_at/error`、`jobs.name` 全部真实存在，**R1 的 SELECT 列名无误**。新增命名类型 `export type AgentRunsOverview = { agentRuns: AgentRunSummary[]; jobRuns: JobRunSummary[] }`（R1 内联对象类型改为命名，供 global.d.ts 引用）。
- AGENT_RUNS_LIST handler 三处修正：① 行对象用显式行类型（局部 `type AgentRunRow = { id:string; status:string; input_json:string; cost_usd:number|null; duration_ms:number|null; started_at:number; finished_at:number|null }`），**不用 R1 片段的 `(r:any)`**——WORKFLOW_CN R3 明令新代码禁新增 any；② `JSON.parse(r.input_json)` 必须 try/catch 兜底，损坏行降级 `source:'chat', prompt:''`，不得让 Dashboard 整页挂；③ runsList 归入 `agent` 域，定为 `window.creatorOS.agent.runsList(limit?)`——R1 §3.1 片段写成顶层 `runsList:`，与其自己的 global.d.ts 注释「agent.runsList」不一致，以本节为准。jobRuns 的 LEFT JOIN jobs + `(已删除)` 兜底照 R1（列名核对无误）。
- JOB_DELETE handler 修正版（覆盖 R1 §3.6）：

```ts
const jobsLog = logger.child('jobs');
ipcMain.handle(IPC.JOB_DELETE, (_e, id: string) => {
  repo.deleteJob(id); scheduler.reload(); changed();
  jobsLog.info('Job deleted', { jobId: id });
});
```

修正点：① job_runs 级联 DELETE 从 handler 的 raw prepare 移进 repo.deleteJob（§7.3），handler 保持与 JOB_TOGGLE 同款单行薄句式；② 补 R1 缺失的 info 日志（§7.6）；③ 无返回值（与 jobs.toggle 同为 void）。删除不存在的 id 为幂等 no-op，不做存在性检查。

### 7.3 DB（清单 3）

**无新表、无新列、无迁移**——本特性对 DB 只有只读查询 + 删除。schema.ts 里 job_runs 与 jobs 之间**没有外键/级联**（建表 SQL 均无 REFERENCES），级联必须显式两步。删除走 Drizzle（与 repo 现有 createJob/toggleJob 同风格），不走 raw prepare：

```ts
// repository.ts：import 行补 jobRuns；新增唯一方法
deleteJob(id: string) { db.delete(jobRuns).where(eq(jobRuns.jobId, id)).run(); db.delete(jobs).where(eq(jobs.id, id)).run(); },
```

agent_runs / job_runs 的**读取**查询留在 IPC handler 用 rawSqlite prepare——两表本就无 repo 方法先例，且 Scheduler.ts:22/43 已在此层用 raw 读写 job_runs；只读、单连接同步执行、无事务需求。

### 7.4 Gateway（清单 4）

**决策：不加 DELETE /api/jobs/:id。** 理由：① 纯 UI 重构，删除入口只有 Automation 页（走 IPC）；② Gateway 是外部 agent 面，新增端点须同步 API.md、鉴权与 400 校验说明、补对应 e2e，超出 R1 范围；③ AC-U1 的 e2e 用既有 `POST /api/jobs` 造数据后从 UI 删除即可覆盖，无需 DELETE 端点。外部调用方真有清理需求时再按既有 Bearer + badRequest 惯例补。

### 7.5 Agent/MCP（清单 5）

**无改动。** 不新增 MCP 工具、不动 claudeAgent / stepBus / browserTools / mcp-stdio.ts；agent.run 执行路径（Scheduler.ts:28-40 → streamRun）不触碰。§2.7 工具名映射是纯 renderer 展示层转换，不进 agent 内核与工具循环清单。

### 7.6 日志（清单 6）

registerIpc 现有惯例：多数 mutation handler（JOB_CREATE/TOGGLE 等）**不打日志**；例外是 files 域用模块级 `const filesLog = logger.child('files')` 对写/改名/watch 打 info（52-88 行）。job 删除是破坏性操作，按 files 先例补打点：handler 处 `logger.child('jobs')`（模块级常量），删除后 `info('Job deleted', { jobId: id })`——与 Scheduler 的 `'Job started'/'Job completed'` 同 meta 风格（jobId 而非内部 runId）。AGENT_RUNS_LIST 为只读查询不打点（避免每次挂 Dashboard 刷日志）。

### 7.7 测试分派（清单 7）

vitest（`tests/`，纯逻辑、不依赖 Electron）：

| 新文件 | 被测 | 用例设计 |
|---|---|---|
| tests/cron-next.test.ts | shared/cronNext.ts | ① 基础：`0 9 * * *` 在当日 09:00 前/后两态；`0 * * * *`、`*/15 * * * *`、`0 9-17 * * *`、`0 9 * * 1`、`0 9 1,15 * *`；② 月末：`0 23 31 * *` 跳过不足 31 天的月份；③ 闰年：`0 9 29 2 *` from 2028-01-01 → 2028-02-29；④ 未来 366 天无解：同表达式 from 2026-03-01 → null（下次在 ~730 天外）；`0 9 30 2 *`（2 月永无 30 日）恒 null；⑤ 非法/不支持：4 段、7 段、乱串、`@daily`、`L`/`#`/`W`、`MON` 名、6 段（含秒）→ parseCron 返回 null；⑥ 语义对齐 node-cron：dow `7`=周日、`?`=`*`、**dom 与 dow 双受限按 AND**（`0 9 1 * 1` 只匹配「1 号且周一」）——node-cron `_shared.js` 的 TimeMatcher.match 实测为 `runOnDay && runOnWeekDay`，非 Vixie OR，预览必须与 Scheduler 实际调度一致 |

cronNext 契约修正（覆盖 R1 §3.6 的单函数签名）：拆两步——`parseCron(expr): CronFields | null`（null=不支持/非法）+ `nextCronDate(fields, from): Date | null`（null=366 天窗口内无匹配）。R1 单 `nextCronDate(): Date|null` 无法区分两种 null，UI 就无法区分「无法预览该表达式」与「366 天内未触发」两条文案。本地时区枚举（Scheduler 未传 timezone，node-cron 默认系统本地时区，预览与之一致）。

| 新文件 | 被测 | 用例设计 |
|---|---|---|
| tests/format.test.ts | shared/format.ts | fmtCost：0/0.009→`<$0.01`、0.01→`$0.01`、12.345→`$12.35`；fmtDur：0/99→`<0.1s`、100→`0.1s`、1234→`1.2s`；toolLabel：`mcp__creatoros-browser__browser_navigate`→打开页面（前缀剥离）、未知短名直通降级、`Read`→读文件、空/undefined→`''` |

playwright（`e2e/`，遵守测试自足 / launchApp 隔离 / 离线 fixture 三规则）：

| 文件 | 内容 |
|---|---|
| e2e/dashboard.spec.ts（新） | 全新 app 先断言双空态文案 → fake 模式跑一轮 chat（agent_runs 落行）+ `POST /api/jobs` + `/api/jobs/:id/run`（demo）造一条 job_runs → 断言两列表渲染（prompt 截断、`<$0.01` 成本格式、状态 pill）→ `window.creatorOS.agent.runsList(3)` 直测 IPC 契约形状 |
| e2e/automation-delete.spec.ts（新） | 造 job（UI 表单）→ 点删除按钮 → 断言行内「确认删除？」态 → 再点 → `creatorOS.state()` jobs 数 -1（AC-U1 原文）→ spec 内 `new DatabaseSync(<userData>/data/creatoros.sqlite)` 断言 jobs 与 job_runs 级联已删（e2e 读主进程数据惯例） |
| e2e/settings.spec.ts、e2e/files.spec.ts | §5.1 的 6 处文案断言同步修改（7 个断言位）：settings:83 侧栏 `Settings`→`设置`、:103 `Save`→`保存`、:109 `Test connection`→`测试连接`、:116 侧栏 `Browser`→`浏览器`、:120 h1 `'Settings'`→`'设置'`；files:27/68 侧栏 `"Files"`→`"文件"` |
| 可选 | native 暗色控件：evaluate `getComputedStyle` 断言 checkbox `accent-color` / select 背景非 UA 白底（对应截图 12 号；主要靠视觉验收） |

AC → 测试层映射（给 §六 各 AC 指定机械验证手段）：

| AC 群 | 验证层 |
|---|---|
| AC-对比度 / G7 / G10 / G6 / G9 / G8 / B5 / F4 / S1 / AP5 / L1-L2 | grep/脚本（§六 已写明命令）+ 截图复核 |
| AC-G1 / T2 / S2 / S3 / AP2 / G5 / D2 / B3 / A2 / F2 / C1 / AP4 / 术语 / U2-文案 | 视觉截图（§5.2 清单）；U2 数值部分另加 vitest cronNext |
| AC-G3 / G2 / T1 | grep button class + 截图；T1 补 e2e：settings.spec evaluate 断言 Save 按钮 className 含 btn-primary |
| AC-D1 / AC-IPC | e2e dashboard.spec（数据渲染 + runsList 契约）+ grep 四处同步各命中 1 |
| AC-U1 | e2e automation 删除端到端 |
| AC-AP1 / AP3 | vitest format.test + agent.spec 现有链路回归 + 截图 |
| AC-B2 / F3 | browser.spec / files.spec 各加一条断言（`!t.loading` / `.files-tree` clientHeight 跟随容器） |
| AC-e2e / 无新依赖 | `npm run gate` 全量 + package.json diff |

### 7.8 风险与边界

1. **SettingsPage 输入框 DOM 顺序（硬约束）**：settings.spec:99-100 按 `inputs[0]`=Base URL、`inputs[3]`=Model 填值，:89 断言 `.page input.field` ≥4。T2/T3 只加 help 行与 datalist（都不是 `input.field`），四个输入框的顺序与数量不得变。
2. **e2e 选择器契约**：保留项与同步项以 §5.1 两张表为唯一事实源，R3 不得另行增改；本节 7.7 的文案修改与 §5.1 完全一致，不重复维护。
3. **cronNext 性能**：分钟粒度枚举上限 366×24×60≈52.7 万次循环，每次只做 5 个 set/range 判定，毫秒级完成；输入 onChange 直算，无需防抖。代价是四年份一次的表达式（`29 2`）在非闰年窗口内返回 null → UI 显示「366 天内未触发」，属预期降级而非错误。
4. **job 正在运行时删除**：agent.run 在 Scheduler.run 的 await 中（Scheduler.ts:35），删除只清 jobs/job_runs 行并 reload() 掉后续调度；运行中的 run 不中断，结束时 `UPDATE job_runs / jobs WHERE id=?` 均命中 0 行（幂等 no-op），但 streamRun 的 finalize 仍会写一行 agent_runs（claudeAgent.ts:202，audit trail 语义）。**评估：可接受**——Dashboard「最近 Agent 运行」多出一条孤儿记录（带 prompt 与 `cron:<name>` source，可读可追溯），不破坏一致性；更严谨的做法需要 Scheduler 暴露 stopJobRuns()（跟踪活动 run），超出纯 UI 重构范围，不阻塞 R3。
5. **cronNext 与 node-cron 的语义对齐**：预览与实际调度器语义不一致会产生「预览 9 点、实际不跑」的信任问题。已核对 node-cron dist：dom∧dow 双受限为 AND（非 Vixie OR）、dow `7` 归一为周日、`?` 视同 `*`，而 `@nickname`/`L`/`#`/`W`/6 段均会被 cron.validate 接受。cronNext 对这些**不支持的形式返回 parseCron=null，UI 显示「无法预览该表达式」**，绝不出错误答案；模板下拉全是标准 5 段，正常路径不受影响。
