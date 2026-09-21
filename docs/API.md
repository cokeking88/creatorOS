# Local Gateway API

Default base URL: `http://127.0.0.1:17890`.

Except `/health`, send `Authorization: Bearer <CREATOROS_GATEWAY_TOKEN>`.

## Browser

- `GET /api/browser/profiles`
- `GET /api/browser/tabs?profileId=...`
- `POST /api/browser/tabs` `{ profileId?, url? }`
- `POST /api/browser/tabs/:id/activate`
- `POST /api/browser/navigate` `{ url }`
- `POST /api/browser/back`
- `POST /api/browser/forward`
- `POST /api/browser/reload`
- `GET /api/browser/snapshot`
- `POST /api/browser/click` `{ ref }`
- `POST /api/browser/fill` `{ ref, value }`
- `POST /api/browser/upload` `{ ref, paths }`
- `POST /api/browser/scroll` `{ dx?, dy? }`
- `POST /api/browser/evaluate` `{ expression }`
- `GET /api/browser/screenshot`

Element refs are snapshot-scoped. Take a new snapshot after navigation or major DOM changes.

## Jobs

- `POST /api/jobs/:id/run`

## Webhooks

- `POST /webhooks/feishu`

The Feishu route supports URL verification and logging only in v0.1. Add signature verification and command mapping before production use.
