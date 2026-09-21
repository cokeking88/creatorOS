# CreatorOS architecture

## Core invariant

The embedded browser is owned by CreatorOS. An agent, cron job, webhook or external MCP client must not launch an external Chrome instance. They call BrowserKernel, which controls the active Electron `WebContentsView` backed by a persistent Electron `Session` partition (`persist:*`).

```text
React renderer                 External Claude/MCP host
      |                                  |
 allowlisted IPC                        stdio MCP bridge
      |                                  |
Electron main <---- localhost gateway ---+
      |
 BrowserKernel
   |-- ProfileManager -> persist: partitions
   |-- TabManager -> WebContentsView(s)
   |-- semantic snapshot/click/fill
   `-- CDP escape hatch via webContents.debugger
      |
 Chromium renderer for the actual platform page
```

## Process boundary

- **Renderer**: application chrome/UI only. It has no Node integration.
- **Preload**: exposes a small allowlisted API with `contextBridge`.
- **Main**: owns browser views, SQLite, scheduler, agent provider and local gateway.
- **Embedded page renderer**: third-party site inside `WebContentsView`, with `sandbox=true`, `nodeIntegration=false`, `contextIsolation=true`, `webSecurity=true`.

## Browser profiles

A profile row contains a stable Electron session partition. `persist:` makes cookie/cache/storage persistent across application restarts. Accounts may bind to a profile, but a profile can represent a broader working identity when desired.

## Browser tools

The MVP implements semantic snapshot → element `ref` → click/fill. This is intentionally above raw coordinates. `executeJavaScript` is available internally; `webContents.debugger` is the future CDP escape hatch for Network/DOM/Input use cases.

## Automation

Persisted cron jobs currently support the `demo` and `browser.navigate` workflow types. The workflow table exists for expansion to DAG/step based workflows.

## MCP

`scripts/mcp-stdio.ts` is a thin MCP v2 bridge. It connects to the already-running CreatorOS local gateway instead of creating its own browser. This preserves the single-browser-runtime invariant.
