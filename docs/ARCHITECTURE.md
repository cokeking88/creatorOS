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

## Agent kernel (v0.3: Claude Code Agent SDK)

The internal agent is no longer a hand-rolled JSON tool loop. `ClaudeAgentService`
(`src/main/agent/claudeAgent.ts`) drives the Claude Code Agent SDK
(`@anthropic-ai/claude-agent-sdk`): each run spawns a `claude` CLI subprocess,
and browser tools are served by an **in-process SDK MCP server**
(`createSdkMcpServer`, name `creatoros-browser`, 15 `browser_*` tools) bound to
the same BrowserKernel the UI shows — same semantics as the external stdio
bridge, but with no network hop.

```text
AgentPanel (renderer)
   ^  IPC event:agent-step / event:agent-done
   |
 StepBus  --->  registerIpc  --->  webContents.send
 (main-process bus; also consumed directly by tests)
   ^
 ClaudeAgentService.streamRun(prompt, { runId, source, resumeSessionId })
   |
 stepTranslator: SDK stream messages -> AgentStep { runId, seq, source,
   msgUuid, durationMs, type: text | tool_start | tool_result | done | error }
   |
 SDK query() --spawns--> claude CLI subprocess
   |                        ^ in-process MCP server (creatoros-browser)
   |                        | bound to BrowserKernel
   `-- audit: agent_runs row per run (provider='claude-code',
       session_id, steps_json, cost_usd, duration_ms)
```

- **Chat and cron share one engine.** The Scheduler's `agent.run` workflow type
  calls the same `streamRun` with `source='cron:<jobName>'`; steps flow into the
  same event stream (the panel shows a cron banner) and into the agent log
  module. IPC chat is fire-and-forget: `agent:run` returns `{runId}` immediately,
  every later state arrives as events.
- **`streamRun` never rejects** — run-level failures resolve `ok:false` so the
  scheduler can branch on the result; `finalize()` is the single place that
  writes the terminal `agent_runs` state and publishes the done event.
- **Stop** is two-phase (`q.interrupt()` then abort) via a run registry keyed
  by runId; a run that ends without a terminal step gets a synthesized one.
- **Fake transport** (`CREATOROS_FAKE_CLAUDE=1`) replays a scripted message
  sequence through the same translator, keeping tests fully offline.
- Engine endpoint config (baseUrl / authToken / apiKey / model) is read per run
  from the settings store (DB over env) and passed to the subprocess as
  `ANTHROPIC_*` env vars.

## Process boundary

- **Renderer**: application chrome/UI only. It has no Node integration.
- **Preload**: exposes a small allowlisted API with `contextBridge`.
- **Main**: owns browser views, SQLite, scheduler, the Claude Code agent service and local gateway.
- **Embedded page renderer**: third-party site inside `WebContentsView`, with `sandbox=true`, `nodeIntegration=false`, `contextIsolation=true`, `webSecurity=true`.

## Browser profiles

A profile row contains a stable Electron session partition. `persist:` makes cookie/cache/storage persistent across application restarts. Accounts may bind to a profile, but a profile can represent a broader working identity when desired.

## Browser tools

The MVP implements semantic snapshot → element `ref` → click/fill. This is intentionally above raw coordinates. `executeJavaScript` is available internally; `webContents.debugger` is the future CDP escape hatch for Network/DOM/Input use cases.

## Automation

Persisted cron jobs support the `demo`, `browser.navigate` and `agent.run` workflow types. `agent.run` hands a scheduled prompt to the same agent engine as the chat panel (see above), so scheduled agent work inherits the browser runtime, step stream and audit trail. The workflow table exists for expansion to DAG/step based workflows.

## MCP

Two paths expose the same browser tool semantics, both bound to the single BrowserKernel runtime:

- `scripts/mcp-stdio.ts` is a thin MCP v2 bridge for external clients. It connects to the already-running CreatorOS local gateway instead of creating its own browser.
- The in-process SDK MCP server (`creatoros-browser`) serves the 15 `browser_*` tools to the spawned `claude` subprocess directly, without a network hop.

This preserves the single-browser-runtime invariant on both paths.
