import { test } from '@playwright/test';
import {closeApp,  expect, FIXTURE_PAGE_URL, gw, launchApp, waitForGateway } from './helpers.js';

let app: Awaited<ReturnType<typeof launchApp>>;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

test('snapshot → click → fill full loop on the offline fixture page', async () => {
  // 1. Navigate to the offline fixture page
  await gw.post('/api/browser/navigate', { url: FIXTURE_PAGE_URL });

  // 2. Snapshot returns semantic elements with refs
  let r = await gw.get('/api/browser/snapshot');
  expect(r.status).toBe(200);
  const snap = r.json;
  expect(snap.title).toBe('CreatorOS Fixture Page');
  const input = (snap.elements as Array<{ ref: string; tag: string }>).find((e) => e.tag === 'input');
  expect(input).toBeTruthy();
  const button = (snap.elements as Array<{ ref: string; tag: string }>).find((e) => e.tag === 'button');
  expect(button).toBeTruthy();

  // 3. Fill the search input
  expect(input && button).toBeTruthy();
  await gw.post('/api/browser/fill', { ref: input!.ref, value: 'hello creatoros' });

  // 4. Verify the value landed via evaluate
  r = await gw.post('/api/browser/evaluate', { expression: "document.getElementById('search-input').value" });
  expect(r.json.result).toBe('hello creatoros');

  // 5. Click the button → page reacts (status text contains the filled value)
  await gw.post('/api/browser/click', { ref: button!.ref });
  await app.window.waitForTimeout(300);
  r = await gw.post('/api/browser/evaluate', { expression: "document.getElementById('status').textContent" });
  expect(r.json.result).toBe('clicked:hello creatoros');
});

test('scroll changes window.scrollY', async () => {
  await gw.post('/api/browser/scroll', { dx: 0, dy: 800 });
  await app.window.waitForTimeout(300);
  const r = await gw.post('/api/browser/evaluate', { expression: 'window.scrollY' });
  expect(r.json.result).toBeGreaterThan(0);
});

test('tabs list reflects the fixture page', async () => {
  const r = await gw.get('/api/state');
  const tab = (r.json.tabs as Array<{ url: string; title: string }>)[0];
  expect(tab.url).toContain('127.0.0.1:17992');
  expect(tab.title).toBe('CreatorOS Fixture Page');
});

test('embedded session presents a standard Chrome UA (hygiene, not spoofing)', async () => {
  // AC2 of docs/specs/ua-standardization.md: no Electron/app tokens leak into
  // pages browsed inside the embedded browser, and the version is the REAL
  // engine version (not the placeholder fallback).
  const r = await gw.post('/api/browser/evaluate', { expression: 'navigator.userAgent' });
  const ua = String(r.json.result);
  expect(ua).toMatch(/Chrome\/\d+\.\d+\.\d+\.\d+/);
  expect(ua).not.toContain('Chrome/0.0.0.0'); // UA source must be bound before first session
  expect(ua).toContain('Macintosh'); // test runs on darwin
  expect(ua).not.toContain('Electron');
  expect(ua).not.toContain('reatorOS'); // matches CreatorOS and creatoros
  expect(ua).not.toContain('creatoros');
});
