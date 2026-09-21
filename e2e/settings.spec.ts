import { test, expect } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { launchApp, waitForGateway, type Launched } from './helpers.js';

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

test('default config is mock', async () => {
  const cfg = await app.window.evaluate(() => window.creatorOS.settings.get());
  expect(cfg.provider).toBe('mock');
});

test('save + hot reload + test connection + on-disk persistence (self-contained flow)', async () => {
  // 1. Save a config with an unreachable endpoint — must take effect immediately
  const cfg = await app.window.evaluate(() => window.creatorOS.settings.set({
    provider: 'openai-compatible',
    compatBaseUrl: 'http://127.0.0.1:1/none', // unreachable by design
    compatKey: 'fake-key',
    compatModel: 'fake-model',
  }));
  expect(cfg.provider).toBe('openai-compatible');

  // 2. The very next chat goes through the new provider (hot reload) and fails with a network error
  const chat = await app.window.evaluate(async () => {
    try {
      const r = await window.creatorOS.agent.chat([{ role: 'user', content: 'ping' }]);
      return { ok: true as const, provider: r.provider };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  });
  expect(chat.ok).toBe(false);
  expect(chat.error).toMatch(/fetch failed|Provider HTTP/);

  // 3. Test connection reports the failure details against the same config
  const tr = await app.window.evaluate(() => window.creatorOS.settings.testProvider());
  expect(tr.ok).toBe(false);
  expect(tr.provider).toBe('openai-compatible');
  expect(tr.detail).toBeTruthy();

  // 4. Config is still intact after the failed chat
  const still = await app.window.evaluate(() => window.creatorOS.settings.get());
  expect(still.provider).toBe('openai-compatible');

  // 5. The row is persisted on disk (plain-JSON-in-SQLite storage contract)
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'));
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key = 'provider'").get() as { value: string };
    expect(row.value).toContain('openai-compatible');
  } finally {
    db.close();
  }
});

test('config survives an app restart on the same userData', async () => {
  await app.window.evaluate(() => window.creatorOS.settings.set({ provider: 'anthropic', anthropicKey: 'sk-e2e-persist', anthropicModel: 'test-model' }));
  const userData = app.userData;
  await app.electronApp.close();

  const second = await launchApp(userData);
  try {
    await waitForGateway();
    const cfg = await second.window.evaluate(() => window.creatorOS.settings.get());
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.anthropicKey).toBe('sk-e2e-persist');
    expect(cfg.anthropicModel).toBe('test-model');
  } finally {
    await second.electronApp.close();
  }
});
