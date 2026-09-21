# Verification status

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
