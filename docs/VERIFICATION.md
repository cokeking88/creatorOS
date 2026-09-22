# Verification status

## 2026-09-22 v0.4 — full UI/UX redesign (R0→R5 workflow)

- Flow re-run per the mandated workflow: R0 audit (47 findings, **B1 retracted after a real probe** — fake-mode screenshots showed a stale address bar, but gateway-driven navigation updates it correctly; the audit doc records the retraction) → R1 spec `docs/specs/ui-redesign.md` (799 lines: tokens/contrast table/component specs/per-page/AC) → R2 arch section (§7, 117 lines: two new IPC contracts corrected against real schema/repo/scheduler semantics, node-cron AND-vs-OR semantics verified against its dist source) → R3 two-batch implementation → R4 dual-layer report → R5 docs.
- Design system: 3-layer dark backgrounds (was 6 near-identical grays), `color-scheme:dark` (native controls no longer UA-white), 5-step type scale, 8px spacing grid, 4-class button system (all text/background pairs recomputed ≥4.5:1; primary hover avoids the brightness() trap that would break white-on-accent contrast), hand-drawn SVG icon set (zero new deps), unified Empty component, Chinese-first copy with a terminology table.
- New capabilities surfaced by the redesign: `agent:runs.list` IPC + 工作台 dashboard with real agent_runs/job_runs lists; `job:delete` IPC + two-step delete with explicit job_runs cascade; cron template dropdown + next-run preview (`shared/cronNext.ts`, parse/preview split so the UI can distinguish "unsupported expression" from "no fire within 366 days"); Chinese tool labels + `<$0.01`/`<0.1s` formatting (`shared/format.ts`).
- vitest **10 files / 92 tests** (+31: cron boundaries — month-end, leap-year, never-fires, malformed, node-cron AND semantics, `N/step` rejection; fmt edges; toolLabel prefix stripping).
- playwright **9 specs / 39 tests** (was 33): +dashboard.spec (empty states, formatted run rows, runsList IPC contract shape cross-checked against SQLite), +automation-delete.spec (two-step confirm, jobs+job_runs cascade verified on disk), AC-B2 (no stuck loading dot), AC-F3 (tree follows container); 6 copy assertions updated for the Chinese UI; launch.spec overflow loop made density-adaptive.
- Visual acceptance: 15 screenshots `docs/screenshots/redesign/` via `scripts/capture-ui-redesign.mts` (fake mode, offline). 4 non-blocking polish items recorded in the dev report.
- Capture-script lessons: arborist's row wrapper intercepts coordinate-based Playwright clicks (drive row onClicks via evaluate); `app.close()` darwin hang applies to capture scripts too (exit directly after shots).
- Gate: `npm run gate` exit 0 (ESLint 0 errors/40 legacy warns, 4×typecheck, build, vitest 92, e2e 39). No new dependencies.

## 2026-09-22 v0.3.3 — account files + agent fence

- Feature spec: docs/specs/account-files.md (R0+R1+R2 combined; open-source selection researched: CodeMirror 6 / react-arborist / chokidar 5 / SDK cwd+hook fence, sources in spec).
- vitest 61 (fence suite: ../ escape, absolute escape, sibling-prefix, symlink escape in+out, macOS /var vs /private/var tmp symlink asymmetric-realpath bug found and fixed in isInsideRoot).
- e2e 33: new files.spec (seeded layout on create, editor save round-trips to real disk via node:fs, chokidar watcher refresh on external write, mkdir/rename fenced on disk + escape write rejected).
- Security fix bundled (SECURITY.md #12): before v0.3.3, allowedTools could NOT constrain bypassPermissions (SDK semantics), so file tools and Bash were effectively open since v0.3.0. Now: PreToolUse hook fences file tools to the active account dir (realpath), Bash denied outright, maxTurns 40 / maxBudgetUsd 0.5 on every run.
- Playwright lesson re-learned: <option> elements are display:none inside a closed <select> — toBeVisible never passes; assert presence (toHaveCount) instead.


## 2026-09-22 v0.3.2 — fix: SDK "binary failed to launch" (misleading error)

**Symptom**: every real (non-fake) agent run in the app failed with `Claude Code native binary ... exists but failed to launch ... libc / musl` — even though the binary is healthy (runs standalone, in node, and in Electron without options).

**Root cause**: `buildOptions()` passed `cwd: userData/agent-workspace` — a directory nothing ever created. The CLI subprocess fails its startup chdir, never completes the readiness handshake, and the SDK classifies every startup-phase death under this one misleading "binary/libc" error. Reproduced by bisection in the Electron main process: `cwd` → nonexistent dir = fail; `cwd` → pre-created dir = success; without `cwd` = success. Single-variable isolation confirmed cwd as the necessary and sufficient condition.

**Fix**: `mkdirSync(workspace, { recursive: true })` before assembling options (`src/main/agent/claudeAgent.ts` buildOptions).

**End-to-end verification in the real running app**: gateway-created `agent.run` job → `job_runs.status=success`, output `{"text":"ok","steps":3,"sessionId":"<real uuid>"}` — the first genuinely working agent run through the app (not fake mode). Note: e2e fake mode never exercised this path (fake transport skips buildOptions), which is why 28 green tests coexisted with a 100%-reproducible runtime failure; documented as a gate blind spot.

## 2026-09-22 v0.3 final release — docs sync, gate green

- Scope: agent kernel replaced by the Claude Code Agent SDK + live step streaming (spec `docs/specs/agent-claude-code.md`). Full gate re-run for the release commit: `npm run gate` exit 0 (vitest 6 files / 43 tests, playwright 27 tests in 6 spec files — launch/logs/browser kept, agent/settings rewritten, cron-agent added; all offline via `CREATOROS_FAKE_CLAUDE=1`).
- The R0–R5 flow was re-run end to end for this feature with a spec artifact chain: `agent-claude-code.md` (R0 需求) → `agent-claude-code-ui.md` (R1 UI) → `agent-claude-code-arch.md` (R2 架构) → `agent-claude-code-dev-report.md` (R3 开发自检) → `agent-claude-code-test-report.md` (R4 测试). R4 details below.
- Docs synced at R5 (DoD #4): README, USAGE_CN, ARCHITECTURE, SECURITY, API, WORKFLOW_CN §8 kernel routing, DEVELOPMENT_PLAN_CN M2 addendum.

## 2026-09-22 v0.3 R4 — dual test layers green (Claude Code agent)

- vitest **6 files / 43 tests** (~0.8s): logger, stepTranslator (msgUuid/durationMs/is_error), settings migration, + new stepBus / runRegistry / fakeScript suites (fake script goes through the real translator — same path as E2E).
- playwright e2e **27 tests / 5 specs** (~10–15s, fully offline): launch/logs/browser kept green; agent.spec + settings.spec rewritten, cron-agent.spec added. `npm run gate` exit 0.
- Two R3 defects surfaced by E2E and fixed in R4: (1) steps were published without the `source` enrichment → cron banner could never show; (2) Gateway `reply400()` shaped a JSON body but returned HTTP 200, so invalid jobs were **persisted** — now `reply.code(400)` + success path returns 201.
- `launchApp()` scrubs ambient `ANTHROPIC_*` env vars: a dev shell running Claude Code exports them, and they leak into `engineConfigFromEnv()` making "default empty config" assertions non-deterministic (same class of issue R3 hit on the vitest side).

### New Playwright gotchas (v0.3, settings.spec stability)

- `electronApp.close()` **occasionally hangs ~forever on darwin** when the test runner has exercised the app first (stress-repeat runs stalled 60s per repeat; a standalone node script closing/restarting the same app never hangs — runner-only interaction). Fix: bounded close — race `close()` against a 5s timer, then `process().kill('SIGKILL')`. Safe for persistence assertions because `settings.set` commits synchronously (WAL).
- Restart tests: keep them **last** in the file and hand the relaunched instance to `afterAll`; do NOT launch a third app mid-suite to "restore" a live `app` handle.
- Tests must await their own runs to completion even when asserting "returns immediately" — a fire-and-forget run's steps leak into a later test's onAgentStep collector (worker keeps the renderer alive between tests in a file).

## 2026-09-21 v0.2.1 — dual test layers green

- Added **Vitest** unit layer (20 cases, ~0.8s): logger ring/rotation/level-threshold/child-tags/file-flush, provider fallback branches + env mapping, `parseToolRequest` (fences/prose/noise), `SettingsStore` SQLite roundtrip/upsert/env-fallback/corrupt-row.
- `npm run gate` now = ESLint → 4×typecheck (renderer/main/e2e/test) → build → **vitest** → **playwright E2E 18**.
- Testability refactors: `parseToolRequest` extracted from AgentRuntime; `SettingsStore` takes an injected sqlite handle; `Logger.close()` flush hook; `setSqliteForTesting` on db/index.
- New `docs/WORKFLOW_CN.md`: full R0 需求 → R1 UI（fuyao-coding 对图）→ R2 架构 → R3 开发 → R4 双层测试 → G 门禁 → R5 发布 workflow with per-stage stop conditions and DoD.

## 2026-09-21 v0.2 — full gate green (real machine, macOS arm64)

- `npm install`: OK (Electron 44.4.0 binary via npmmirror; drizzle-orm `node-sqlite` dist-tag 1.0.0-beta.16).
- `npm run gate`: **all green** —
  - ESLint: 0 errors (29 `no-explicit-any` warnings on legacy code, non-blocking)
  - typecheck ×3: renderer (`tsconfig.json`), main+preload (`tsconfig.main.json`), e2e (`tsconfig.e2e.json`)
  - build: vite (38 modules) + main-process tsc + tools tsc
  - Playwright E2E: **18/18 passed** (~7s), fully offline (local fixture HTTP server on 127.0.0.1:17992)
- Git hooks: `pre-commit` → gate:fast, `pre-push` → full gate (husky, auto-installed via `prepare`).
- CI: `.github/workflows/ci.yml` runs `npm run gate` on macOS-14 + Node 24.

### v0.2 E2E coverage

| Spec | What it proves |
|---|---|
| launch (4) | app boots, gateway health, seeded state, 401 auth, preload bridge + mounted renderer |
| logs (5) | startup logs by module, navigate→browser log with meta, module/level filters, IPC logs:list |
| settings (3) | default mock; save→hot-reload chat→failed provider test→on-disk SQLite row; config survives app restart |
| browser (3) | offline fixture page: snapshot→fill→evaluate→click→page reacts; scroll; tab state |
| agent (3) | mock chat via tool-loop runtime; agent_runs recorded; runId in logs |

### Known issues fixed along the way

- Playwright restarts the worker (and reruns beforeAll → fresh app) after a failed test: tests must be self-contained (see `e2e/settings.spec.ts` history). Cross-test state assumptions broke when an earlier assertion failed — not an app bug.
- `electronApp.evaluate` cannot use dynamic `import()` (no dynamic-import callback in the utility context) — read the SQLite file directly from the spec instead.
- `window-all-closed` on darwin + `activate` re-creating windows is normal Electron behavior; E2E uses throwaway `CREATOROS_USER_DATA` dirs to stay isolated.

## 2026-09-21 v0.1 — initial bring-up (superseded by v0.2)

TypeScript/TSX syntax transpilation, relative import audit and Electron 44 API cross-check were done in the generation container; `npm install` could not run there (DNS `EAI_AGAIN`). First real-machine verification on the target Mac completed 2026-09-21: install + typecheck + build + prod launch + gateway/browser/MCP/job/persistence smoke all passed after fixing three generated-code bugs (missing `drizzle-orm/node-sqlite` driver → node-sqlite dist-tag; `.cts` generic-arrow syntax; snapshot script calling undefined `norm`).
