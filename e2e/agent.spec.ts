import { test } from '@playwright/test';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { expect, launchApp, waitForGateway } from './helpers.js';

let app: Awaited<ReturnType<typeof launchApp>>;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

test('mock provider chat returns a final answer through the tool-loop runtime', async () => {
  const r = await app.window.evaluate(async () => {
    const res = await window.creatorOS.agent.chat([{ role: 'user', content: '你好' }]);
    return { provider: res.provider, text: res.text };
  });
  expect(r.provider).toBe('mock');
  expect(r.text).toContain('Mock Agent');
});

test('agent run is recorded in agent_runs', () => {
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  try {
    const rows = db.prepare('SELECT provider, status FROM agent_runs ORDER BY started_at DESC LIMIT 5').all() as Array<{ provider: string; status: string }>;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].provider).toBe('mock');
    expect(rows[0].status).toBe('success');
  } finally {
    db.close();
  }
});

test('agent tool loop logs carry the runId', async () => {
  const logs = await app.window.evaluate(() => window.creatorOS.logs.list({ module: 'agent', limit: 50 }));
  const entries = logs.entries as Array<{ message: string; meta?: { runId?: string } }>;
  expect(entries.length).toBeGreaterThan(0);
  const started = entries.find((e) => e.message === 'Agent run started');
  expect(started).toBeTruthy();
  expect(started?.meta?.runId).toBeTruthy();
});
