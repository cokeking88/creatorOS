# CreatorOS 研发计划（里程碑级概要）

> 基线：v0.1 底座（已完成并通过真实构建验证）+ v0.2 门禁/日志/Settings（本轮）。
> 估算口径：1 人独立开发，含联调与自测；「人天」按有效开发日计。

## Definition of Done（全里程碑通用）

- `npm run gate` 全绿（ESLint 0 error + 3×typecheck + build + Playwright E2E 18 用例）
- 文档同步更新（README / USAGE_CN / SECURITY / VERIFICATION）
- 新增主进程能力必须有对应 E2E 覆盖

---

## M1 — 底座（已完成，v0.1）

| Epic | 人天 | 状态 |
|---|---|---|
| Electron + WebContentsView 内嵌浏览器、持久 Profile、多 Tab、OAuth 弹窗内化 | 4 | ✅ |
| BrowserKernel 语义原语（snapshot/click/fill/upload/scroll/screenshot/evaluate）+ CDP 逃生舱 | 3 | ✅ |
| AgentRuntime 工具循环 + Mock/Anthropic/OpenAI-compatible Provider | 2 | ✅ |
| SQLite/Drizzle 全套 schema + seed、内容库、Cron、Gateway、飞书骨架、MCP 桥 | 3 | ✅ |
| 真机构建验证与三处生成代码 bug 修复（drizzle node-sqlite 驱动缺失、.cts 泛型语法、snapshot 未定义函数） | 1 | ✅ |

合计 **13 人天**。

## M2 — 工程化与可观测性（本轮，v0.2）

| Epic | 人天 | 说明 |
|---|---|---|
| 门禁工具链：ESLint flat config + husky pre-commit/pre-push + CI workflow + `npm run gate` 分级 | 1 | pre-commit 秒级 gate:fast，pre-push 全量 gate |
| 日志系统：ring buffer/级别阈值/按日轮转/异步 flush/模块标签 + 各模块打点 + IPC/Gateway 双通道 + Logs UI 页 | 1.5 | 时间/级别/模块/搜索过滤、自动刷新、meta 展开 |
| LLM 页面配置：settings 服务 + SQLite 存储 + Provider 热生效 + Test connection + Settings UI 页 | 1.5 | DB 配置 > env 默认；保存即生效无需重启 |
| Playwright E2E：fixture 离线页 + 5 个 spec 18 用例 + CREATOROS_USER_DATA 测试隔离 | 1.5 | 覆盖启动/日志/设置/浏览器/Agent；含 Playwright worker 重启语义踩坑修复 |
| 文档：研发计划/使用文档/安全/验证更新 | 0.5 | |

合计 **6 人天**（实际本轮一次会话完成）。

## M3 — 平台 Adapter 与发布确认门（下一轮，建议 2 周）

| Epic | 人天 | 依赖 |
|---|---|---|
| Adapter 抽象层：`PlatformAdapter` 接口（create_post/upload_images/set_title/fill_body）+ 注册表 | 2 | M2 |
| 小红书创作中心 Adapter：登录检测、标题/正文/图片填充、发布前暂停点 | 4 | Adapter 抽象层 |
| 发布确认门：高危动作（发布/删除/私信）二段确认 UI + Agent 协议扩展（confirm_required 工具结果） | 2 | — |
| 发布结果抓取：发布后 URL 回写 contents、状态机流转 draft→scheduled→published | 2 | XHS Adapter |

合计 **10 人天**。

## M4 — 数据采集与评论管理（约 2 周）

| Epic | 人天 | 依赖 |
|---|---|---|
| 数据采集 Adapter：笔记阅读/点赞/收藏/评论数抓取入 contents 扩展表 | 3 | M3 |
| 日报 Cron 工作流：每日 23:30 拉取当日数据 + Agent 生成表现分析 | 2 | 采集 Adapter |
| 评论管理：评论列表抓取、AI 草稿回复、人工确认发送 | 3 | 发布确认门复用 |

合计 **8 人天**。

## M5 — 集成与加固（约 1.5 周）

| Epic | 人天 | 依赖 |
|---|---|---|
| 飞书机器人路由：签名校验 + `/publish` `/collect` `/status` 命令映射到工作流 | 3 | M3/M4 |
| 密钥加固：safeStorage（Keychain）加密 settings，迁移现明文行 | 1 | M2 |
| Schema 版本化迁移：version 表 + 顺序迁移替换幂等 bootstrap | 1.5 | — |
| 可观测性增强：日志导出、job_runs/agent_runs 审计 UI、崩溃恢复 | 1.5 | M2 |

合计 **7 人天**。

---

## 总量

| 里程碑 | 人天 | 累计 |
|---|---|---|
| M1 底座（已完成） | 13 | 13 |
| M2 工程化（已完成） | 6 | 19 |
| M3 平台 Adapter | 10 | 29 |
| M4 数据与评论 | 8 | 37 |
| M5 集成加固 | 7 | 44 |

至「可长期运营」全量约 **44 人天**；最小可运营闭环（M1–M3）约 **29 人天**。

## 风险与开放项

- **平台页面改版**是最大不确定项：Adapter 层已隔离，但 XHS 创作中心 DOM 变化需随版维护（预留 20% 缓冲）
- **风控**：固定 Profile + 可视化操作 + 高危人工确认是既定原则，不引入指纹伪装
- E2E 依赖真实 Electron 启动，CI 需 macOS runner（已配）；Windows/Linux 跑全套 E2E 未验证
