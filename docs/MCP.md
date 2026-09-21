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

Current bridge exposes the BrowserKernel surface: profile/tab listing, open/switch tab, navigation, back/forward/reload, semantic snapshot, click/fill, scroll, evaluate, screenshot, plus manual job execution. The bridge stays thin and never creates a second browser runtime.
