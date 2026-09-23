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
  // Grow real content (fake-mode runs stream steps + bubbles) until the chat
  // actually overflows, then assert the layout holds: chat scrolls, composer
  // pinned inside the viewport. R3's Chinese tool labels (§2.7) made each run
  // render more compactly, so a fixed three rounds no longer guarantee
  // overflow — the loop keeps the test independent of content density.
  let rounds = 0;
  for (;;) {
    const overflowed = await app.window.evaluate<boolean>(`(() => {
      const chat = document.querySelector('.chat');
      return chat.scrollHeight > chat.clientHeight;
    })()`);
    if (overflowed || rounds >= 6) break;
    await app.window.locator('.composer textarea').fill(`第${rounds}轮：打开 example.com 然后详细汇报页面内容，多说几句`);
    await app.window.locator('.composer button:has-text("发送")').click();
    rounds++;
    await app.window.waitForTimeout(1200);
  }
  await app.window.waitForTimeout(900);
  const m = await app.window.evaluate<Record<string, number | string | boolean>>(`(() => {
    const chat = document.querySelector('.chat');
    const composer = document.querySelector('.composer');
    const panel = document.querySelector('.agent');
    const appEl = document.querySelector('.app');
    return {
      chatOverflow: getComputedStyle(chat).overflowY,
      panelBottom: Math.round(panel.getBoundingClientRect().bottom),
      appBottom: Math.round(appEl.getBoundingClientRect().bottom),
      windowH: window.innerHeight,
      composerBottom: Math.round(composer.getBoundingClientRect().bottom),
      chatHasScrollSpace: chat.scrollHeight > chat.clientHeight,
    };
  })()`);
  expect(m.chatOverflow).toBe('auto');
  // The whole layout is pinned to the viewport — nothing gets pushed below the fold.
  expect(Number(m.panelBottom)).toBeLessThanOrEqual(Number(m.windowH) + 1);
  expect(Number(m.appBottom)).toBeLessThanOrEqual(Number(m.windowH) + 1);
  expect(Number(m.composerBottom)).toBeLessThanOrEqual(Number(m.windowH) + 1);
  expect(m.chatHasScrollSpace).toBe(true);
  // Composer-coverage regression (v0.5 hotfix): with NO cron banner rendered the
  // conditional child used to shift .chat into the grid's auto row, collapsing
  // the composer to 0px and letting the chat paint over it. Assert geometry
  // directly: the chat must end at or above the composer's top edge, and the
  // composer must have real height.
  const cover = await app.window.evaluate<Record<string, number>>(`(() => {
    const chat = document.querySelector('.chat');
    const composer = document.querySelector('.composer');
    return {
      chatBottom: Math.round(chat.getBoundingClientRect().bottom),
      composerTop: Math.round(composer.getBoundingClientRect().top),
      composerH: Math.round(composer.getBoundingClientRect().height),
    };
  })()`);
  expect(cover.composerH).toBeGreaterThan(40); // not collapsed to 0
  expect(cover.chatBottom).toBeLessThanOrEqual(cover.composerTop + 1); // chat never overlaps the composer
});
