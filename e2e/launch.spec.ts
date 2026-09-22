import { test } from '@playwright/test';
import {closeApp,  expect, gw, launchApp, waitForGateway } from './helpers.js';

let app: Awaited<ReturnType<typeof launchApp>>;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

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

test('＋P inline input creates and activates a new profile (window.prompt is dead in sandbox)', async () => {
  const before = await app.window.evaluate(() => window.creatorOS.state());
  const beforeCount = before.profiles.length;
  // Click ＋P -> inline input appears (no window.prompt, which is disabled in sandboxed renderers)
  await app.window.locator('.browser-top button[aria-label="New profile"]').click();
  const input = app.window.locator('.browser-top-input');
  await expect(input).toBeVisible();
  await input.fill('e2e-inline-profile');
  await input.press('Enter');
  await app.window.waitForTimeout(500);
  const after = await app.window.evaluate(() => window.creatorOS.state());
  expect(after.profiles.length).toBe(beforeCount + 1);
  const created = after.profiles.find((p: { name: string }) => p.name === 'e2e-inline-profile');
  expect(created).toBeTruthy();
  expect(created.partition).toMatch(/^persist:/);
  expect(after.activeProfileId).toBe(created.id); // created profile auto-activated
});

test('agent chat area scrolls instead of blowing out the panel', async () => {
  const metrics = await app.window.evaluate(() => {
    const chat = document.querySelector('.chat') as HTMLElement | null;
    const panel = document.querySelector('.agent') as HTMLElement | null;
    if (!chat || !panel) return null;
    return {
      chatScrollable: chat.scrollHeight >= chat.clientHeight,
      chatOverflow: getComputedStyle(chat).overflowY,
      panelWithinWindow: panel.getBoundingClientRect().bottom <= window.innerHeight + 1,
    };
  });
  expect(metrics).not.toBeNull();
  expect(metrics!.chatOverflow).toBe('auto');
  // The panel (and its composer) must stay inside the window even with content.
  expect(metrics!.panelWithinWindow).toBe(true);
});
