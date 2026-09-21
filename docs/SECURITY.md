# Security notes

1. Third-party pages never receive Node integration.
2. `contextIsolation`, Chromium sandbox and `webSecurity` stay enabled.
3. Renderer IPC is allowlisted in preload; no generic `ipcRenderer.send` is exposed.
4. Local HTTP gateway binds to `127.0.0.1` by default and requires a bearer token except `/health`.
5. Do not expose the gateway directly to the public Internet. Put an authenticated relay/VPN in front if remote access is required.
6. Treat browser page text as untrusted input. A real agent implementation should keep browser instructions/data separate from trusted system instructions and require confirmation for publish/delete/message/payment actions.
7. The Feishu endpoint is only a skeleton. Add Feishu signature verification before production use.
8. Provider API keys configured via the Settings page are stored as plain JSON in the local SQLite settings table (single-user local tool trade-off, decided 2026-09-21). M5 hardening replaces this with `safeStorage` (macOS Keychain). Keys are never sent anywhere except the configured provider endpoint.
9. Automation should respect each platform's terms and rate limits. This project does not attempt to spoof browser fingerprints or bypass platform abuse controls.
