import { defineConfig } from '@playwright/test';

// E2E tests launch the real Electron app via _electron.launch (no separate browser download).
// A tiny local HTTP fixture server keeps browser specs fully offline.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'off',
  },
  webServer: {
    command: 'node e2e/fixtures/server.mjs',
    url: 'http://127.0.0.1:17992/',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
