# UI 重构 R4 测试报告（双层）+ G 门禁

- 被测：commit `80b3e67`（feat(ui): full visual redesign）+ 后续 lint 清理提交
- 规范：`docs/specs/ui-redesign.md` §7.7 测试分派 / §六 AC 映射
- 日期：2026-09-22

## 一、G 门禁（全量，最终态）

| 阶段 | 结果 |
|---|---|
| ESLint | 0 errors，40 warnings（全部存量 `no-explicit-any`；R3 新文件 0 警告——files.spec 两个新警告已清） |
| typecheck ×4 | renderer / main+preload / e2e / tests 全过 |
| build | vite + main tsc + tools tsc ✅ |
| vitest | **10 files / 92 tests**（61 存量 + 31 新增，~0.9s） |
| playwright | **9 specs / 39 tests**（~30s，全离线 fake 模式） |

`npm run gate` exit 0。R3 期间共跑 4 次全量门禁，无一次红。

## 二、vitest 新增（31 用例）

**tests/cron-next.test.ts（22）**——`shared/cronNext.ts` 纯函数：

| 组 | 用例要点 |
|---|---|
| 基础 | `0 9 * * *` 当日 09:00 前/后两态；`0 * * * *`；`*/15`；`0 9-17 * * *`；`0 9 * * 1`；`0 9 1,15 * *` |
| 月末 | `0 23 31 * *` 跳过不足 31 天的月份 |
| 闰年 | `0 9 29 2 *` from 2028-01-01 → 2028-02-29；非闰年窗口 → null |
| 恒无解 | `0 9 30 2 *`（2 月永无 30 日）恒 null |
| 非法/不支持 | 4 段、7 段、乱串、`@daily`、`L`、`#`、`W`、月名、6 段（含秒）、`N/step`（node-cron validate 也拒）→ parseCron null |
| 语义对齐 | dow `7`=周日归一、`?` 仅 dom/dow 视同 `*`、**dom∧dow 双受限 AND**（`0 9 1 * 1` 只匹配 1 号且周一，与 node-cron `_shared.js` TimeMatcher 实测一致，非 Vixie OR）、wrap-around `55-5` |

**tests/format.test.ts（9）**——`shared/format.ts`：

- fmtCost：0/0.009 → `<$0.01`；0.01 → `$0.01`；12.345 → `$12.35`
- fmtDur：0/99 → `<0.1s`；100 → `0.1s`；1234 → `1.2s`
- toolLabel：`mcp__creatoros-browser__browser_navigate` → 打开页面（前缀剥离）；未知短名直通降级；`Read` → 读文件；空/undefined → `''`

## 三、playwright（39：33 存量 + 6 新增，另有 6 处断言同步改）

**新增 spec**：

- `e2e/dashboard.spec.ts`（3）：
  1. 全新 app：工作台 4 卡 + 双空态文案（Empty 组件）
  2. fake chat + demo job 后：双列表渲染，行含「对话/<$0.01/成功」「job 名/成功」——AC-D1 + AP3 格式化端到端
  3. `agent.runsList(3)` IPC 契约形状（source/prompt/status/ok/startedAt/finishedAt/jobName/error）+ SQLite 行数交叉核对——AC-IPC
- `e2e/automation-delete.spec.ts`（2）：
  1. UI 表单造 job → 两段式删除（确认删除？态 3s 恢复）→ state() 减一 + SQLite jobs/job_runs 级联已删
  2. 造 → 跑（agent.run fake）→ 删：调度器写入的 job_runs 也级联
- `e2e/browser.spec.ts` +1：AC-B2 导航完成后全部 tab `loading:false`（无常驻点）
- `e2e/files.spec.ts` +1：AC-F3 树容器正高度（ResizeObserver 而非硬编码 600px）

**6 处文案断言同步改**（§5.1 清单）：settings.spec（侧栏 设置/浏览器、按钮 保存/测试连接、h1 设置）、files.spec（侧栏 文件 ×2）、dashboard/automation-delete 用中文侧栏导航。launch.spec 溢出断言循环化（R3 中文步骤行更紧凑，固定 3 轮不再保证溢出——改为「溢出即停，≤6 轮」的自适应循环）。

## 四、AC → 验证层映射核销（§7.7 表）

| AC 群 | 层 | 状态 |
|---|---|---|
| AC-对比度/G7/G10/G6/G9/G8/B5/F4/S1/AP5/L1-L2 | grep/脚本 | ✅（dev-report §三 命令输出） |
| AC-G1/T2/S2/S3/AP2/G5/D2/B3/A2/F2/C1/AP4/术语 | 视觉截图 15 张 | ✅（dev-report §四） |
| AC-G3/G2/T1 | grep + 截图 + e2e | ✅（Save 蓝 09 号截图实证 T1） |
| AC-D1/AC-IPC | e2e dashboard.spec | ✅ |
| AC-U1 | e2e automation-delete.spec | ✅ |
| AC-AP1/AP3 | vitest format + 截图 10/11 号 | ✅ |
| AC-B2/F3 | browser/files.spec 断言 | ✅ |
| AC-e2e/AC-无新依赖 | npm run gate + package.json diff | ✅ |
| AC-B1（撤销项） | 不在 AC 内 | ✅ 按撤销处理 |

## 五、发现并修复的测试层问题

1. e2e/files.spec 两个未用 import（mkdirSync/gw）在 R3 改造后成为 lint 警告 → 已删，新文件 0 警告基线保持。
2. launch.spec 溢出测试对内容密度敏感（中文步骤行更短）→ 改为溢出探测循环，不再依赖轮数常量。
3. capturePage 在窗口遮挡时返回缓存帧（R1 子 agent 发现）→ 截图脚本先 native 后 DOM、逐页导航后拍摄，15 张无陈旧帧。

## 六、遗留（不阻塞 G）

- 4 个视觉收尾项（dev-report §四）：Dashboard 副行拥挤、Logs 消息列宽、Empty chips 偏宽、运行中状态无字重区分——打磨项，未立项。
- Real-gateway 手动冒烟点不变（fake 模式无法覆盖真实 typewriter/网关 400 等，与 v0.3 相同边界）。
