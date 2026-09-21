# Development guide

## Requirements

- macOS / Windows / Linux desktop
- Node.js 22+ for development
- npm 10+ or pnpm

Electron 44 embeds Node 24, which provides `node:sqlite`. No native sqlite addon rebuild is required.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

Production-like local run:

```bash
npm run build
npm start
```

Package an unpacked application:

```bash
npm run package:dir
```

## Important implementation note

The browser page itself is not part of the React DOM. `BrowserPage` measures the browser slot and sends its bounds to the main process; main positions the active `WebContentsView` over that rectangle. Switching pages hides/detaches the view without destroying its session.
