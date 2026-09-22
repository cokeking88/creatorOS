import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {closeApp,  expect, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC5/AC6/AC7 — Settings engine config (offline). The app runs with
 * CREATOROS_FAKE_CLAUDE=1 and a throwaway userData dir; tests are self-contained
 * (a failed test restarts the worker and re-runs beforeAll with a fresh dir).
 *
 * Ordering note: the restart test is LAST and hands its relaunched instance to
 * afterAll. All app closes go through closeApp() — Playwright's graceful
 * electronApp.close() occasionally hangs on darwin (see closeApp comment),
 * which under the test runner turned the restart test into a 60s stall.
 */

/** Close an Electron app with a bounded, hard-kill fallback. */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

test('default engine config is empty/env-derived, not a legacy provider shape', async () => {
  const cfg = await app.window.evaluate(async () => window.creatorOS.settings.get());
  expect(cfg).toEqual({}); // launchApp injects no ANTHROPIC_* env for the app process
  expect(cfg).not.toHaveProperty('provider'); // AC6/AC11: legacy shape is gone
});

test('settings.set roundtrips baseUrl/authToken/model and persists to the SQLite settings row', async () => {
  const saved = await app.window.evaluate(async () => {
    const next = { baseUrl: 'https://relay.internal/v1', authToken: 'tok-e2e', model: 'claude-sonnet-4-5' };
    const r = await window.creatorOS.settings.set(next);
    return { next, r, back: await window.creatorOS.settings.get() };
  });
  expect(saved.r).toEqual(saved.next);
  expect(saved.back).toEqual(saved.next);

  // On-disk row (AC5): key='agent-engine', value is pure JSON of the engine config.
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'agent-engine'").get() as { value: string } | undefined;
    expect(row).toBeDefined();
    const parsed = JSON.parse(row!.value) as Record<string, unknown>;
    expect(parsed).toEqual({ baseUrl: 'https://relay.internal/v1', authToken: 'tok-e2e', model: 'claude-sonnet-4-5' });
    expect(parsed).not.toHaveProperty('provider');
  } finally {
    db.close();
  }
});

test('hot reload: a second set overwrites in place and get returns the new value', async () => {
  const r = await app.window.evaluate(async () => {
    const first = await window.creatorOS.settings.set({ baseUrl: 'https://one/v1' });
    const second = await window.creatorOS.settings.set({ baseUrl: 'https://two/v1', apiKey: 'sk-9' });
    const back = await window.creatorOS.settings.get();
    return { first, second, back };
  });
  expect(r.first).toEqual({ baseUrl: 'https://one/v1' });
  expect(r.second).toEqual({ baseUrl: 'https://two/v1', apiKey: 'sk-9' });
  expect(r.back).toEqual(r.second); // latest value wins, no merge of stale keys
});

test('testProvider in fake mode returns ok:true', async () => {
  const r = await app.window.evaluate(async () => window.creatorOS.settings.testProvider());
  expect(r.ok).toBe(true);
  expect(r.detail).toBe('fake mode');
});

test('Settings page UI saves config and Test connection shows the ok state', async () => {
  // Driven via window.evaluate (the suite's established pattern; also keeps the
  // UI test's assertions racing-free since React mounts/updates are polled).
  const ui = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));

    // 1. Navigate to the Settings page via the sidebar, wait for React to mount it.
    byText('.sidebar button', 'Settings')!.click();
    let page: HTMLElement | null = null;
    for (let i = 0; i < 50 && !page; i++) { await sleep(50); page = document.querySelector('.page'); }
    const title = page!.querySelector('h1')!.textContent;
    let inputs: HTMLInputElement[] = [];
    for (let i = 0; i < 50 && inputs.length < 4; i++) {
      inputs = [...document.querySelectorAll<HTMLInputElement>('.page input.field')];
      if (inputs.length < 4) await sleep(50);
    }

    // 2. Fill baseUrl + model through the form inputs (React controlled inputs).
    const setVal = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(inputs[0], 'https://relay-ui.internal/v1');
    setVal(inputs[3], 'claude-sonnet-4-5');

    // 3. Save → "已保存并立即生效" (AC5 hot-reload UI confirmation).
    byText('.page button', 'Save')!.click();
    let savedMsg = '';
    for (let i = 0; i < 50 && !savedMsg; i++) { await sleep(50); savedMsg = document.querySelector('.ok-msg')?.textContent ?? ''; }
    const saved = savedMsg;

    // 4. Test connection → "✓ 引擎连通" (AC7 fake mode).
    byText('.page button', 'Test connection')!.click();
    let testMsg = '';
    for (let i = 0; i < 100 && !testMsg; i++) { await sleep(50); testMsg = document.querySelector('.test-detail')?.closest('p')?.textContent ?? ''; }
    const tested = testMsg;

    // 5. Navigate back to the Browser page (the app's default state) so the
    // instance this spec leaves behind matches what other specs/app exits see.
    byText('.sidebar button', 'Browser')!.click();
    for (let i = 0; i < 50 && !document.querySelector('.page'); i++) await sleep(50);
    return { title, saved, tested };
  });
  expect(ui.title).toBe('Settings');
  expect(ui.saved).toContain('已保存并立即生效');
  expect(ui.tested).toContain('✓ 引擎连通');
  expect(ui.tested).toContain('fake mode');

  // The form saves its whole state (fields mount pre-filled from settings.get()),
  // so the roundtrip result is the previous row plus the two fields we changed.
  const back = await app.window.evaluate(async () => window.creatorOS.settings.get());
  expect(back).toMatchObject({ baseUrl: 'https://relay-ui.internal/v1', model: 'claude-sonnet-4-5' });
  expect(back).not.toHaveProperty('provider');
});

test('config survives an app restart on the same userData dir', async () => {
  const cfg = { baseUrl: 'https://persist.internal/v1', authToken: 'tok-persist', model: 'claude-opus-4-6' };
  await app.window.evaluate(async (c: { baseUrl: string; authToken: string; model: string }) => {
    await window.creatorOS.settings.set(c);
  }, cfg);
  const userData = app.userData;
  // Close the first instance, relaunch against the SAME userData. This test is
  // last: the relaunched instance becomes the spec's app so afterAll closes it.
  await closeApp(app);
  const second = await launchApp(userData);
  app = second;
  await waitForGateway();
  const back = await second.window.evaluate(async () => window.creatorOS.settings.get());
  expect(back).toEqual(cfg);
});
