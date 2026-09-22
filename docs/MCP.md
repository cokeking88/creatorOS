# MCP integration

Start CreatorOS first, then run the stdio bridge:

```bash
CREATOROS_GATEWAY_TOKEN=change-me npm run mcp
```

Example host configuration (shape varies by host):

```json
{
  "mcpServers": {
    "creatoros": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/absolute/path/to/CreatorOS",
      "env": { "CREATOROS_GATEWAY_TOKEN": "change-me" }
    }
  }
}
```

Current bridge exposes the BrowserKernel surface: profile/tab listing, open/switch tab, navigation, back/forward/reload, semantic snapshot, click/fill, scroll, evaluate, screenshot, plus manual job execution (`job_run`) and a read-only operations quartet — `job_list` / `content_list` / `account_list` / `skill_list` (v0.5). The bridge stays thin and never creates a second browser runtime.

Boundary note (v0.5): the read-only quartet forwards to the gateway GET endpoints (`/api/jobs` / `/api/contents` / `/api/accounts` / `/api/skills`) and is single-sourced from `src/main/agent/appToolDefs.ts` — the same definitions the in-process `creatoros-app` SDK server uses, so names/descriptions/schemas cannot drift between the two hosts. Write and high-impact app tools are deliberately NOT exposed on the bridge: an external MCP host holding the gateway token can read operations state but cannot mutate the unattended execution surface (see `docs/SECURITY.md` #13).
