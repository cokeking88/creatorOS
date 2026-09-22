# Security notes

1. Third-party pages never receive Node integration.
2. `contextIsolation`, Chromium sandbox and `webSecurity` stay enabled.
3. Renderer IPC is allowlisted in preload; no generic `ipcRenderer.send` is exposed.
4. Local HTTP gateway binds to `127.0.0.1` by default and requires a bearer token except `/health`.
5. Do not expose the gateway directly to the public Internet. Put an authenticated relay/VPN in front if remote access is required.
6. Treat browser page text as untrusted input. A real agent implementation should keep browser instructions/data separate from trusted system instructions and require confirmation for publish/delete/message/payment actions.
7. The Feishu endpoint is only a skeleton. Add Feishu signature verification before production use.
8. Agent engine keys configured via the Settings page are stored as plain JSON in the local SQLite settings table (single-user local tool trade-off, decided 2026-09-21). M5 hardening replaces this with `safeStorage` (macOS Keychain). Keys are only ever passed to the spawned agent subprocess as `ANTHROPIC_*` env vars and sent to the configured engine endpoint, never elsewhere. Legacy v0.2 provider rows are migrated to the env-derived default on read.
9. The internal agent kernel is a Claude Code Agent SDK run: each run spawns a `claude` CLI subprocess. Containment measures:
   - `CLAUDE_CONFIG_DIR` points into the app's `userData/claude-agent` directory, so the subprocess never reads or writes the developer's `~/.claude` (no global config/sessions leak).
   - `settingSources: []` — user-level/global Claude settings files are not loaded.
   - `allowedTools` is limited to `mcp__creatoros-browser__*` (the 15 browser tools); the subprocess has no file system or shell tool surface.
   - `permissionMode: 'bypassPermissions'` is used because the whole tool surface is the browser whitelist — no tool can block on a permission prompt, and none can touch files or run commands. If the tool surface ever widens, replace this with `canUseTool`-based approval.
   - High-impact actions (publish/delete/message/payment) are constrained by the system prompt to stop and ask the user. A hard `PreToolUse` hook blocking such tools is reserved for M5 hardening.
   - `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` keeps the subprocess off telemetry/update endpoints.
10. Automation should respect each platform's terms and rate limits. This project does not attempt to spoof browser fingerprints or bypass platform abuse controls.
11. UA hygiene (v0.3.1): embedded sessions present a standard Chrome user-agent built from the REAL engine version and REAL platform — the default Electron UA's `Electron/<ver>` and app-name tokens are dropped so manual browsing is not self-identifying as an embedded/automation tool. This is presentation hygiene, not fingerprint spoofing: no canvas/WebGL/audio noise, no version forging (a forged version that mismatches the engine's real capabilities is itself a strong automation signal), no automation-trace hiding.
12. Account-file fence (v0.3.3): agent file tools (Read/Write/Edit/Glob/Grep) are intentionally enabled so the agent manages account directories, but a PreToolUse hook denies any path outside the active account directory (realpath-checked against symlink escape) and denies Bash outright. PreToolUse deny applies even under `bypassPermissions` (SDK hooks.md), which is what makes `bypassPermissions` acceptable here. **Historical note**: before v0.3.3, `allowedTools: [mcp__creatoros-browser__*]` did NOT constrain `bypassPermissions` — SDK semantics let unlisted built-in tools fall through and be approved, so the file tools and Bash were effectively open from v0.3.0 to v0.3.2. Fixed by the fence + explicit `disallowedTools: [Bash, NotebookEdit]`. The fence implementation is unit-tested (`tests/account-files.test.ts`) including `../` escape, absolute-path escape and symlink escape. When no account directory is active, all file tools are denied.
