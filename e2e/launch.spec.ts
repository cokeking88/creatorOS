import { test } from '@playwright/test';
import { expect, gw, launchApp, waitForGateway } from './helpers.js';

let app: Awaited<ReturnType<typeof launchApp>>;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

test('gateway /health responds ok', async () => {
  const r = await gw.get('/health');
  expect(r.status).toBe(200);
  expect(r.json).toEqual({ ok: true });
});

test('app state contains seeded data', async () => {
  const r = await gw.get('/api/state');
  expect(r.status).toBe(200);
  const state = r.json;
  expect(state.profiles.length).toBeGreaterThanOrEqual(1);
  expect(state.profiles[0].partition).toMatch(/^persist:/);
  expect(state.contents.length).toBeGreaterThanOrEqual(1);
  expect(state.jobs.length).toBeGreaterThanOrEqual(1);
  expect(state.tabs.length).toBeGreaterThanOrEqual(1);
  expect(state.activeProfileId).toBeTruthy();
});

test('unauthorized request is rejected', async () => {
  const res = await fetch('http://127.0.0.1:17991/api/state');
  expect(res.status).toBe(401);
});

test('renderer has the preload bridge and mounted app', async () => {
  const hasBridge = await app.window.evaluate(() => typeof window.creatorOS === 'object' && typeof window.creatorOS.state === 'function');
  expect(hasBridge).toBe(true);
  const appEl = await app.window.evaluate(() => {
    const el = document.querySelector('.app');
    return el ? el.children.length : 0;
  });
  expect(appEl).toBeGreaterThan(0);
});
