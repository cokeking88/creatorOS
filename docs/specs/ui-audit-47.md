# CreatorOS UI/UX 审计清单（R0）

- 审计对象：docs/screenshots/audit/ 11 张 1440x900 截图 + src/renderer 源码核对
- 方法：Swift Vision OCR（文字+坐标）→ PIL 像素统计（颜色采样/区域众数/diff/对比度计算）→ 源码逐行核对交互逻辑
- 定级：P1 = 明显丑/影响可用；P2 = 不一致/粗糙；P3 = 打磨项
- 统计：**P1 x 5，P2 x 21，P3 x 21，共 47 项**（其中 B1 复核后撤销为误报，有效 46 项）

先说做得对的（不必动）：两栏 grid 全站统一 1fr:1.3fr（03/06/07/09 像素实测 413:537 一致）；page padding 28px / panel 18px / content-grid gap 18px 基本落实；logs 级别色点、step 成败色、文件「未保存/磁盘已变更」状态、冲突双按钮流程都是好底子。

---

## 一、全局 / 跨页面

**G1 [P1] 原生控件未做暗色适配，浅色控件在暗色主题里穿帮**（03/07/08）
CSS 无 `color-scheme: dark`。实测：Accounts「＋ 新建 Profile」渲染为 UA 默认白底黑字按钮（#efefef 底，03 像素实测 1793px）；Automation「enabled」与 Logs「自动刷新」复选框为白底方块（07 实测 #ffffff）；select 展开列表、UA 下拉箭头均为 light 主题。暗色桌面应用里出现白按钮是第一眼「半成品」信号。
改法：`:root{color-scheme:dark}` 一行先止血，再给无 class 按钮统一 `.btn` 样式。

**G2 [P1] 全应用按钮没有任何 hover / active 反馈**（全站）
全 CSS 只有 .files-row:hover、.logs-table tr:hover、.step:hover 三处容器 hover，**没有一条 button:hover/active 规则**。按钮按下去毫无视觉响应，桌面应用手感发死。
改法：全局 `button{transition:...}` + `:hover{filter:brightness(1.12)}` + `:active{filter:brightness(.92)}`。

**G3 [P1] 按钮四套样式并存**（01/03/04/08/09）
实测四种按钮外观：primary 蓝 #6f8cff（03 Create account）、工具栏灰 #252c39/边框 #343d4e/高36（04 ＋文件、08 Clear）、浏览器栏 #222731/边框 #313846/高32/圆角7（01）、UA 白色（03 新建 Profile）。高度 32/36/39 三种、圆角 7/9 两种、边框三种。
改法：收敛为 .btn-primary（蓝，高32，r8）与 .btn-ghost（灰，同尺寸）两个 token，全站替换。

**G4 [P2] 辅助文字对比度不达标**（10/11/08）
实算：step-time #5b6575 在 #181c24 上仅 **2.90:1**，step-hint #67718a 3.50:1，logs-time #6f7a8c 3.93:1，均低于 AA 4.5:1，10.5~11px 小字实际很难看清。muted #7f8999 为 4.83:1（勉强过线）。
改法：辅助色统一提到 ≥ #8a94a6，时间戳字号 ≥ 11px。

**G5 [P2] 每页下半屏大面积空白，页面像没做完**（02/03/07/09）
像素实测纯背景死区：Dashboard 卡片下 235,200px、Accounts 列表下 137,017px、Settings 右栏下 214,807px、Automation Jobs 下 128,400px。1440x900 下所有内容都堆在上半屏。
改法：列表/面板 grid 用 1fr+min-height:0 拉伸填满剩余高度，Dashboard 增加内容密度。

**G6 [P2] 字号层级失控，h3 比正文还小**（03/06/07/09）
h1 28px；h2 未定义字号用 UA 默认 24px；**h3 只有 14px，小于 16px 正文，层级倒挂**（03「New account」标题比下面输入框文字小）；另有 .step 12px、侧栏 11px、logs 12.5px 各自为政。
改法：定 28/20/16/13/11 五档 type scale，显式设置 h2、h3。

**G7 [P2] 暗色背景六层过近，层次几乎读不出来**（全站）
实测背景有 #0f1115（app）/#101318（main）/#14171d（sidebar、agent）/#151820（browser-top）/#12151b（tabs）/#181c24（panel）六种，相邻层灰阶差仅 3~6，肉眼难辨，全靠 1px 边框撑层次。
改法：收敛为三层（如 #0e1014 / #14171e / #1a1e26），面板用微阴影替代第六层。

**G8 [P2] 中英文混排无规则**（02~09）
同一页面混英文表单（Job name / Handle (optional) / Target URL）、中文提示（定时打开指定页面）、中文表头（时间/级别/模块/消息）；同义不同语：Accounts 左栏 pill「空闲」vs 右栏「No Profile」，空态「No accounts yet.」vs「还没有运营账号」。Dashboard 又是纯英文。
改法：定语言策略（建议中文为主、专有名词英文），出一份术语表统一「Profile=浏览器身份」等叫法。

**G9 [P3] 间距 token 漂移**（02/04）
基线 28/18/14/9 尚可，但 cards gap 14、files-grid gap 14、files-page gap 12、content-grid margin-top 22 vs cards margin 24、logs-toolbar margin 16 各自取值。
改法：统一 8px 栅格（8/16/24/32），删掉 12/22 这类单发值。

**G10 [P3] primary 按钮白字对比不足**（03/06）
#fff on #6f8cff 实算 **3.06:1**，低于按钮文字 AA 4.5:1。
改法：按钮底加深至 #5a78f0 档。

---

## 二、Browser（01 / 10 / 11）

**B1 ~~[P1] Agent 驱动浏览器时，地址栏和标签页不更新（UI 状态过期）~~ → 已实证为误报，撤销（2026-09-22 复核）**
11 里 Agent 已完成并明说「打开 example.com…」但地址栏仍显示 `https://www.google.com/`——根因不是 UI 状态过期，而是**该截图来自 fake 模式**：fake agent 声称导航但从未真实执行导航，地址栏停在 google.com 恰恰是正确行为。复核实验（Playwright 探针，经 Gateway `/api/browser/navigate` —— 与 agent MCP `browser_navigate` 同一条内核路径）：导航后地址栏立即更新为 17992 fixture、标签页标题更新为「CreatorOS Fixture Page」。链路 `TabManager.changed() → event:state-changed → App refresh` 是通的。
真正的问题只在 **fake 模式的可信度**（R3 验收时用真实网关截图即可），与 B2（loading 点常驻）叠加造成了误读。撤销本项，R1 不做此修复。

**B2 [P2] 标签页的 ● 加载标记常驻不清除**（01/10/11）
三张截图标签页标题前都有 `●`（t.loading 渲染），而页面早已加载完成，loading 标志从未被清。
改法：did-stop-loading 事件里把 tab.loading 置 false。

**B3 [P2] 「＋P」按钮语义不明**（01/10/11）
新建浏览器身份的按钮就叫「＋P」，无文字说明，普通运营者不可能理解 P=Profile。
改法：改成「＋ 身份」或图标 + tooltip「新建浏览器身份」。

**B4 [P2] 浏览器顶栏不像真正的浏览器**（01）
排布为 [身份下拉][＋P][←][→][↻][地址栏][＋]，身份选择器放在最左像筛选器；无 favicon；active tab（#252b36）直接压在白色页面上无 1px 分隔线；新标签按钮在工具栏右上而不是标签条尾部。
改法：导航组放最左、地址栏居中占满、身份切换移到右上角头像位，tab 与内容区加边界线。

**B5 [P3] 占位文案暴露内部术语**（01/10/11）
内容区占位显示「Embedded WebContentsView」——这是 Electron 开发术语，不该给用户看（截图因原生视图无法截入而全部显示此占位，日常在首次加载前也会闪现）。
改法：换成中性空态文案（如「输入网址开始浏览」）。

---

## 三、侧栏（全站可见）

**S1 [P2] unicode 字符图标显得廉价**（全站）
◫◎◉✜✎⌁⌗⚙ 八个字符磅重、光学尺寸不一（OCR 实测各 icon 渲染高度 13~19px 不等，多个被误读成 0S、c、#、日），⌁⌗ 多数人不识，⚙ 有被系统替换成 emoji 的风险。
改法：换 16px 线性 SVG 图标集（如 lucide），统一 stroke。

**S2 [P3] 侧栏标签 11px 偏小，激活态弱**（全站）
84px 轨道内 11px 文字 + 20px 字符图标，激活态只有一块浅灰（#242a38 实测），无指示条，与 Files 树的 selected 完全同色分不清主次。
改法：加 3px accent 左指示条或加深激活底色。

**S3 [P3] 品牌只有文字「C|OS」**（全站）
18px 纯文字，无任何 logo mark，应用记忆点为零。
改法：做一个简单方形 mark（C+OS 组合即可）。

---

## 四、Dashboard（02）

**D1 [P2] Dashboard 对运营者毫无价值**（02）
四个孤数字 1/1/1/1（Profiles/Browser tabs/Contents/Active jobs）+ 一段技术说明（persist: partitions、BrowserKernel），每天做自媒体的人既看不懂也用不上；无趋势、无待办、无最近活动。
改法：换成运营向卡片：今日草稿、待发布、账号登录态、下次定时任务 + 最近 Agent 活动流。

**D2 [P3] 统计卡数字与页面标题字号接近、四卡等值单调**（02）
卡片数字 32px 与 h1 28px 太接近；四张卡都是「1」，视觉重复。
改法：数字加副标题/trend，弱化 h1 或强化数字层级。

**D3 [P3] 页面顶栏结构不统一**（02~09）
Dashboard/Accounts/Settings 的 h1 下有 muted 描述行，Files/Content/Automation/Logs 直接进工具栏，节奏不一。
改法：统一「h1 + 一句副描述」模式。

---

## 五、Accounts & Profiles（03）

**A1 [P2] 术语混用 + 原始分区名直出**（03）
Profile 列表项「general · 未绑定账号 · 分区 persist:creator-main」中英拼盘；左栏 pill「空闲」与右栏「No Profile」同义不同语。
改法：统一中文文案，partition 弱化为次行 code 小字。

**A2 [P2] 空状态干瘪，无引导动作**（03）
「No profiles yet.」「No accounts yet.」各一行 muted 完事，没有图标、没有 CTA。
改法：空态给图标 + 一句话 + 主按钮（「创建第一个账号」）。

**A3 [P3] 表单无校验反馈**（03）
Account name 为空点「Create account」静默无反应（源码 if(!name.trim())return），用户不知道发生了什么。
改法：空名时按钮置灰 + 行内提示。

**A4 [P3] 说明段落出现寡行孤字**（03）
左栏说明第三行只剩「建。」一个字换行（OCR y=232 实测）。
改法：段落设 max-width 60ch 或改短文案。

---

## 六、Files（04 / 05）

> 审计材料缺口：05-files-editor 与 04-files 像素 diff 仅一行不同（y=89..104，「目录：accounts/…」的 ID 文字，2717px），**两张实为同一「未打开文件」状态**；且 04/05 间账户被删除重建（ID 变了名称没变）。编辑器打开态（保存按钮、未保存标记、冲突按钮）未进入材料，本节按 04 审计 + 源码推断，R3 验收时需补截。

**F1 [P2] 直接暴露内部账户 ID**（04/05）
工具栏右侧「目录：accounts/62.JAej_TUJD1Ejr36sDSF」——用户不需要、也不该看到存储 ID。
改法：显示账户名，ID 收进 tooltip。

**F2 [P2] 编辑器空态占位太弱**（04）
约 675x560 的大面板只在左上角一行 muted 提示（OCR 实测 y=161、x=416，紧贴左上），其余全空，无视觉焦点。
改法：空态居中：文件图标 + 「选择左侧文件开始编辑」+ 新建按钮。

**F3 [P2] 文件树高度硬编码 600px，底部留空带**（04/05）
react-arborist `height={600}` 写死，与容器真实高度脱节：900 窗口下树面板止于 ~y=741，下方露 ~130px 的 main 背景；矮窗口则被裁切。
改法：用容器 ResizeObserver 高度驱动 Tree。

**F4 [P3] 文件图标用 emoji/unicode（📄 ▾ ▸）**（04）
彩色 emoji 与全站细线风格不搭。
改法：统一 16px 线性 SVG 文件/文件夹图标。

**F5 [P3] 新建/重命名内联输入引起布局跳动**（04 源码核对）
files-creating 输入行插在工具栏与 grid 之间，出现/消失挤压下方布局；且 onBlur 即提交，点到别处就误建文件。
改法：改为原位行内编辑或小模态，onBlur 只关闭不提交。

---

## 七、Content（06）

**C1 [P2] Library 无空状态**（06 源码核对）
contents 为空时右栏只有一个「Library」标题 + 空白面板（代码无 fallback 分支）。
改法：加「还没有草稿，从左侧写下第一篇」空态。

**C2 [P2] 草稿列表缺关键元信息**（06）
列表项只有标题 + 平台 + 正文前 100 字，无创建/更新时间、无平台图标；`body.slice(0,100)` 截断不加省略号，与后续文字粘连。
改法：加时间列 + 平台 badge + 「…」截断。

**C3 [P3] 表单无校验、无保存反馈**（06 源码核对）
空标题静默存成「Untitled」；保存成功直接清空表单，无任何提示。
改法：保存后 toast「已保存」并在 Library 中高亮新条目。

---

## 八、Automation（07）

**U1 [P2] Job 无法删除**（07 源码核对）
列表项只有 enabled 开关，没有删除入口（代码也没有对应 IPC UI）——建错的定时任务永远挂着。
改法：每项加删除按钮（confirm 后执行）。

**U2 [P2] cron 裸输入，无预览无模板**（07）
一个 input 要求用户手写 `0 9 * * *`，无「下次运行时间」预览、无常用模板。对非技术运营者这是最大劝退点。
改法：预设模板下拉（每天 9 点/每周一…）+ 人类可读的下次运行时间预览。

**U3 [P3] agent.run 的 prompt 塞在 413px 窄栏里**（07）
rows=5 的 textarea 和其余表单挤同一窄栏，写长 prompt 很难受，而右栏 Jobs 只有一条很空。
改法：选 agent.run 时表单展开为全宽编辑区。

---

## 九、Logs（08）

**L1 [P3] 「{ + }」当展开图标**（08）
用字面量 `{ + }` 表示「展开详情」，含义全靠猜。
改法：换 chevron 图标 + 「详情」文案。

**L2 [P3] 「↻」刷新按钮无 title/aria-label**（08 源码核对）
唯一的图标按钮没有任何说明，与旁边「Clear」文字按钮混排风格不一。
改法：加 tooltip/aria-label，或统一改文字按钮。

**L3 [P3] 消息列被挤压**（08）
前四列占位后消息列仅 ~330px（OCR 实测消息起 x=730），长消息折行导致行高跳动。
改法：时间/级别列窄化，消息列设 min-width。

---

## 十、Settings（09）

**T1 [P1] Save 主按钮被覆盖成灰色，与 Test connection 无差别**（09 像素实测）
`.row button`（specificity 0,1,1）压过 `.primary`（0,1,0），实测两个按钮同为 #262c38 灰底——主操作完全丢失，用户不知道该点哪个。这是全站 primary 样式最严重的失效点。
改法：显式声明 `.row button.primary`（或重构按钮类），保证主按钮永远蓝。

**T2 [P2] 超长 placeholder 当说明文字用**（09）
「API Key（→ ANTHROPIC_API_KEY，x-api-key；与 Token 二选一，Token 优先）」整句塞 placeholder，聚焦即消失；空字段时一大段灰字占着，看起来像已填了内容（OCR 09 y=308 实测）。
改法：placeholder 一句话，完整说明移到字段下方 muted help 文案。

**T3 [P3] Model 字段裸文本无辅助**（09）
显示原始值 fuyao/fuyao-work[1m]（OCR y=362），无下拉、无校验、无连通性提示。
改法：加常用模型 datalist + blur 校验。

---

## 十一、Agent 面板（01 / 10 / 11）

**AP1 [P2] 步骤行暴露原始 MCP 工具名**（10/11）
`mcp__creatoros-browser__browser_navigate` 长串直接当步骤标题，对运营者是纯噪音，也最显「工程样本」气质。
改法：映射人话标签（「打开网页」），原始名收进步骤详情。

**AP2 [P3] 运行中状态无颜色强调**（01 vs 10 像素实测）
header 状态字「运行中…」与空闲「Claude Code」同为灰 #747c8d，只能靠正文区的旋转齿轮分辨。
改法：运行中给蓝点 + accent 色状态字。

**AP3 [P3] 完成行显示 $0.0000 / 0s**（11 OCR 实测）
四位小数的全零成本看起来像假数据。
改法：小于 $0.01 显示「<$0.01」，0s 显示「<0.1s」。

**AP4 [P3] 空态只有一句话，无快捷指令**（01）
首次打开只有一段 muted 说明，用户不知道能让 Agent 干什么。
改法：加 2~3 个 suggestion chips（「检查各账号登录态」「打开小红书创作中心」）。

**AP5 [P3] cron-banner（源码级）**：⏱ emoji 开头 + 无「查看进度/停止」入口；橄榄绿底虽可读但与全站蓝 accent 无呼应。
改法：换 accent 系颜色，加跳转/停止动作。

---

## Top 5（最影响观感排序）

1. **原生控件 light 穿帮**（G1）：白底「＋ 新建 Profile」按钮、白色复选框、light 下拉——暗色主题第一眼破功，一行 `color-scheme:dark` 就能止血。
2. **按钮系统全面失控**（G3+T1+G2）：四套样式、三种高度、Save 主按钮灰化到和次要按钮一样、全站按钮零 hover/disabled 反馈——交互手感与视觉层级双输。
3. **每页下半屏空白**（G5）：Dashboard 23 万像素级的纯背景死区，全站页面都像只做了上半截。
4. **工程内部件直接面向用户**（S1+B3+AP1+F1+B5 群组）：unicode 字符图标、「＋P」、原始 MCP 工具名、accounts/62.JAej… 内部 ID、「Embedded WebContentsView」——处处提醒用户「这是开发者自用工具」。
5. **中英混排与 Dashboard 价值**（G8+D1）：术语无策略，Dashboard 对运营者零信息量。

（B1 已撤销——见二节内注；B2 loading 点常驻作为 P2 补位。）

## 建议的修复顺序

R1 先做三件低成本高回报：`color-scheme:dark`（G1）→ 按钮 token 收敛 + `.row button.primary` 修复（G3/T1/G2）→ 空态与文案清理（F1/F2/C1/B3/B2）。间距与字号体系（G6/G9）应在 R1 定规范、R3 全站落地。
