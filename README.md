# CreatorOS v0.1

Local-first AI creator operations workspace. The defining property of this MVP is a **persistent browser runtime embedded inside the desktop app**: Electron `WebContentsView` + `persist:` profile sessions + a main-process BrowserKernel. Agents, cron jobs and external bots operate that same internal browser runtime.

## Included

- Electron 44 + React + TypeScript + Vite
- Real embedded `WebContentsView` browser workspace
- Persistent browser profiles/session partitions
- Multi-platform account management with account → persistent profile binding
- Multi-profile and multi-tab BrowserKernel, including internal handling of `window.open`/OAuth popups
- Semantic page snapshot + `click(ref)` / `fill(ref)` / upload / scroll / screenshot / evaluate primitives
- CDP attach escape hatch (`webContents.debugger`)
- SQLite using Node's built-in `node:sqlite` + Drizzle schema/repository
- Content draft management
- Persisted cron jobs + scheduler
- Local Fastify gateway and Feishu webhook skeleton
- Agent Runtime with Mock / Anthropic / OpenAI-compatible providers
- MCP v2 stdio bridge to the running app
- Hardened preload IPC boundary
- Technical design DOCX under `docs/`

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

The first launch seeds one persistent profile, one sample draft and one disabled demo job.

### If you prefer pnpm

```bash
corepack enable
pnpm install
pnpm dev
```

## Browser persistence

`ProfileManager` maps each profile to a stable Electron partition such as `persist:profile-xxxx`. Electron stores cookies, cache and site storage for that partition under the application's user-data directory. CreatorOS reuses that partition on every launch.

The project intentionally does **not** launch Google Chrome, Playwright Chromium or a headless browser.

## Real provider configuration

Default is `mock`, so the app starts without any API key.

Anthropic:

```env
CREATOROS_AGENT_PROVIDER=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-4-5
```

OpenAI-compatible gateway:

```env
CREATOROS_AGENT_PROVIDER=openai-compatible
OPENAI_COMPAT_BASE_URL=https://your-gateway.example/v1
OPENAI_COMPAT_API_KEY=...
OPENAI_COMPAT_MODEL=your-model
```

Restart after changing provider environment variables.

## Local gateway

Default: `http://127.0.0.1:17890`. All endpoints except `/health` require `Authorization: Bearer <CREATOROS_GATEWAY_TOKEN>`.

```bash
curl http://127.0.0.1:17890/health
curl -H 'Authorization: Bearer change-me' http://127.0.0.1:17890/api/state
```

## MCP

CreatorOS must be running, then:

```bash
CREATOROS_GATEWAY_TOKEN=change-me npm run mcp
```

See `docs/MCP.md`.

## MVP boundaries / TODO

This repository is a runnable foundation, not a finished commercial publisher. Before using it for unattended posting, add platform-specific adapters, confirmation gates, robust selector strategies, download/upload tooling, provider tool-calling loops, encrypted secret storage, Feishu signature verification, migrations/versioning, automated tests and per-platform observability.

The internal Agent panel includes a bounded JSON tool loop over BrowserKernel primitives. For production, replace the JSON-action protocol with the native tool-calling API of your chosen provider and add richer confirmation/policy controls.

## Docs

- `docs/CreatorOS_技术设计文档_v0.1.docx`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/SECURITY.md`
- `docs/MCP.md`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/VERIFICATION.md`
- `docs/QUICKSTART_CN.md`
