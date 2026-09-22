# 运营目录与文件管理（Account Files）

> R0 需求 + R1 UI + R2 架构 合并产物（调研先行，来源见文末）。调研结论已定选型：CodeMirror 6 编辑器、react-arborist 文件树、chokidar 5 watcher、Agent 走「cwd + PreToolUse hook 围栏」（不自建文件 MCP）。

## 背景

每个运营账号需要一个专属本地目录，存放该账号的素材/草稿/数据（markdown 为主，少量 json/csv/图片）。要求：工具内直接浏览目录树并查看/编辑文件；Agent 也能管理这些文件；用户与 Agent 同时操作同一份真实文件（无中央索引库，磁盘即真相）。

**顺带修复的安全问题（调研发现）**：当前 SDK 配置 `bypassPermissions + allowedTools:[mcp__creatoros-browser__*]` 并没有关掉内置文件工具和 Bash——SDK 文档明确 "allowed_tools does not constrain bypassPermissions"，未列出的工具 fall through 到 mode 步骤被全部批准。也就是说**现在 Agent 理论上已能读写任意路径/执行任意命令**。本需求把 Agent 收进账号目录围栏。

## 用户故事

- 作为运营者，我希望每个账号有固定目录（账号删了目录还在），以便素材资产可积累、可备份
- 作为运营者，我希望在工具里点开目录就能看/改 markdown 草稿，以便不切出去用 VS Code
- 作为运营者，我希望 Agent 能按目录约定整理素材/写草稿，且**只能动这个目录**，以便放心让它干活
- 作为运营者，Agent 改了文件时工具里能看到变化，以便不产生覆盖冲突

## 范围内 / 范围外

**内**：账号目录约定与初始化；Files 页面（文件树 + 编辑器 + 保存）；账号目录 watcher；IPC（读/写/列树/建目录/改名）；SDK cwd 动态指向账号目录 + PreToolUse 路径围栏 + Glob/Grep 显式加回 + Bash 收紧；v0.3 遗留高危项顺带修复（maxTurns/maxBudgetUsd）。
**外**：图片预览编辑（只读打开方式留给后续）；文件删除（安全考虑，后做）；多账号目录跨搜索；云同步；CLAUDE.md 内容编辑 UI（首次 seed 模板）。

## 验收标准

- **AC1**：新建账号时自动创建其目录 `<userData>/accounts/<accountId>/`，含 `drafts/`、`assets/`、`data/`、`CLAUDE.md`（约定模板）四个初始化项；已有账号首次打开 Files 页时补齐（幂等）。
- **AC2**（e2e）：Files 页选中账号后，文件树列出该账号目录内容；点开 `drafts/` 下 md 文件，编辑器显示内容；修改并保存后重读磁盘一致；磁盘直改文件后 UI 树刷新（watcher 生效）。
- **AC3**（e2e）：新建文件夹/新建文件/重命名经 IPC 落到真实磁盘（断言 node:fs 结果）。
- **AC4**（单测）：路径围栏纯函数 `assertInsideAccountRoot(root, target)`——`../` 逃逸、绝对路径越界、symlink（realpath 后判断）均拒绝；账号根内相对路径放行。
- **AC5**（e2e，fake 模式下的 hook 逻辑单测化）：PreToolUse hook 对 Read/Write/Edit/Glob/Grep 的 tool_input 做围栏校验，越界返回 deny（即使 bypassPermissions）。
- **AC6**：SDK options 变更后真实 run 使用账号目录作为 cwd；`allowedTools` 含 Glob/Grep；`disallowedTools` 禁 Bash（替代绕路：Bash 完全禁用，浏览器与文件操作已覆盖原 Bash 用途）；`maxTurns: 40`、`maxBudgetUsd: 0.5` 生效（cron 与聊天同参）。
- **AC7**：Agent 在面板被要求「在账号目录里新建 hello.md」时（真实网关手测点），文件真实出现在目录与文件树中。
- **AC8**：`npm run gate` 全绿；SECURITY.md 更新（围栏机制 + 之前 bypass 敞开问题的如实记录）。

## R1 UI 设计（Files 页）

```
┌──┬─────────────────────────────────────────┐
│侧│ Files                                    │
│栏│ [账号选择器: 小红书-心理疗愈号 ▼]        │
│  │ ┌──────────┬────────────────────────────┐│
│  │ │ 文件树    │ draft.md        [保存][已保存]││
│  │ │ ▸ assets │ ┌────────────────────────┐││
│  │ │ ▾ drafts │ │                          │││
│  │ │   a.md ●│ │   CodeMirror 6 编辑器     │││
│  │ │   b.md  │ │   (md 高亮 + 语法扩展)    │││
│  │ │ ▸ data  │ │                          │││
│  │ │ CLAUDE. │ │                          │││
│  │ │   md    │ └────────────────────────┘││
│  │ │ [+文件][+目录][重命名]                ││
│  │ └──────────┴────────────────────────────┘│
└──┴─────────────────────────────────────────┘
```

- 三态：空目录（引导文案+快速建 draft）；文件被外部修改（顶栏黄条「磁盘已变更 — 重新加载/覆盖」）；保存失败（红条）
- 侧栏导航加 ✜ Files 页（在 Content 之后）
- 未选中账号时显示账号选择引导（复用 Accounts 页数据）

## R2 架构

分层与数据流：

```
FilesPage (renderer)
  │ IPC: files:list/read/write/mkdir/rename  (新增 5 通道，四处同步)
  ▼
AccountFilesService (src/main/services/accountFiles.ts)
  │ fs/promises + realpath 围栏 + chokidar watcher
  │ 目录根: <userData>/accounts/<accountId>/   ← DB 不存文件，磁盘即真相
  ▼
磁盘真实文件
  ▲
  │ SDK 内置 Read/Write/Edit/Glob/Grep（cwd=账号目录）
  │ + PreToolUse hook → accountFence（realpath 围栏，deny 越界）
ClaudeAgentService (cwd 改为动态: 当前激活账号目录)
```

关键决策：
1. **不自建文件 MCP**——SDK 内置 Read/Write/Edit/Glob/Grep 已完备且更鲁棒（Edit 的三重校验）；自建会抢 system prompt 上下文且让 Agent 在两套工具间摇摆。
2. **围栏只信 PreToolUse hook**：文档明确 hook deny 在 bypassPermissions 下也生效；`blockReadsOutsideWorkingDirectories` 只管读不管写；cwd 只是路径基准不是边界。围栏实现 `fs.realpath` 后前缀校验（防 symlink），归一化 `../`。
3. **Bash 完全禁用**（disallowedTools）——Bash 是围栏无法可靠覆盖的逃逸口（文档明示 Bash 规则不是安全边界）；运营场景浏览器工具+文件工具已覆盖。
4. **watcher 必须有**：Agent 与用户写同一批文件，无 watcher 会出现「Agent 写完、用户旧 buffer 保存覆盖」的数据损坏。chokidar 5（ESM-only，主进程已 bundle 满足）单例 watch 当前账号目录，防抖 250ms，IPC 广播 `event:files-changed`。
5. **CLAUDE.md 随目录 seed**：SDK 从 cwd 自动加载 CLAUDE.md，目录约定（drafts/assets/data 分工）写进去，Agent 天然遵守，不靠 prompt 交代。
6. **maxTurns 40 / maxBudgetUsd 0.5**：cron 无人值守防失控（code review #4），聊天同参（可后续再放宽）。

## 依赖与风险

- chokidar 5 ESM-only：主进程产物是 ESM（package type:module + tsc NodeNext），无兼容问题
- @uiw/react-codemirror React 19：peer `>=17`，风险低；若实测破裂，降级方案为直接 @codemirror/* 手挂（多 ~40 行）
- react-arborist 3.16：peer `>=16.14`
- 风险：账号删除时目录保留（孤儿目录）——接受，备份价值优先
- 风险：真实网关下 AC7/AC6 的手测点依赖 fuyao 网关可用

来源：Agent SDK permissions/hooks/tools-reference（code.claude.com/docs）；npm registry 包元数据（@uiw/react-codemirror 4.25.11 / @codemirror/lang-markdown 6.5.2 / react-arborist 3.16.0 / chokidar 5）；Obsidian vault 模式；调研全文见本文件 git 历史。
