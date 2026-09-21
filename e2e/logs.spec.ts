import { test } from '@playwright/test';
import { expect, FIXTURE_PAGE_URL, gw, launchApp, waitForGateway } from './helpers.js';

let app: Awaited<ReturnType<typeof launchApp>>;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

test('gateway and app modules log at startup', async () => {
  const r = await gw.get('/api/logs');
  expect(r.status).toBe(200);
  const modules: string[] = r.json.modules;
  expect(modules).toContain('gateway');
  expect(modules).toContain('app');
  expect(r.json.entries.length).toBeGreaterThan(0);
});

test('navigate produces a browser-module log entry', async () => {
  await gw.post('/api/browser/navigate', { url: FIXTURE_PAGE_URL });
  await app.window.waitForTimeout(800);
  const r = await gw.get('/api/logs?module=browser');
  const entries = r.json.entries as Array<{ module: string; message: string; meta?: { url?: string } }>;
  expect(entries.length).toBeGreaterThan(0);
  const nav = entries.find((e) => e.message === 'navigate');
  expect(nav).toBeTruthy();
  expect(nav?.meta?.url).toBe(FIXTURE_PAGE_URL);
});

test('module filter isolates browser entries only', async () => {
  const r = await gw.get('/api/logs?module=browser');
  const entries = r.json.entries as Array<{ module: string }>;
  expect(entries.length).toBeGreaterThan(0);
  for (const e of entries) expect(e.module).toBe('browser');
});

test('level filter returns only error rows', async () => {
  const r = await gw.get('/api/logs?level=error');
  const entries = r.json.entries as Array<{ level: string }>;
  for (const e of entries) expect(e.level).toBe('error');
});

test('logs:list IPC exposes entries to the renderer', async () => {
  const count = await app.window.evaluate(async () => {
    const r = await window.creatorOS.logs.list({ limit: 50 });
    return { entries: r.entries.length, modules: r.modules.length };
  });
  expect(count.entries).toBeGreaterThan(0);
  expect(count.modules).toBeGreaterThan(0);
});
