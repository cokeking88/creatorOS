import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeApp, expect, gw, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC-D1 / AC-IPC — Dashboard (UI redesign §3.1/§7.7). Offline, fake mode.
 * Every test seeds its own data and navigates its own pages (self-contained:
 * a failed test restarts the worker and re-runs beforeAll on a fresh dir).
 * Remount note: App renders pages conditionally, so dashboard data refreshes
 * by LEAVING the page and coming back — navigating to the page you are
 * already on does not remount and does not refetch.
 */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

/** Navigate to the dashboard, remounting it even if it is already the active page. */
async function openDashboard(): Promise<void> {
  await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    // Leave to another page first so the dashboard component unmounts…
    byText('.sidebar button', '浏览器')!.click();
    for (let i = 0; i < 50 && !document.querySelector('.browser-page'); i++) await sleep(50);
    // …then mount it fresh (runsList refetch happens on mount).
    byText('.sidebar button', '工作台')!.click();
    for (let i = 0; i < 50 && document.querySelector('.page h1')?.textContent !== '工作台'; i++) await sleep(50);
  });
}

test('fresh app: dashboard renders stat cards and both run-list empty states', async () => {
  await openDashboard();
  const ui = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    // The runsList fetch lands after mount; poll until the empty states appear.
    for (let i = 0; i < 50; i++) {
      const empties = [...document.querySelectorAll('.page .empty b')].map((b) => b.textContent);
      if (empties.length >= 2) return { empties, cards: document.querySelectorAll('.page .card').length, h1: document.querySelector('.page h1')!.textContent };
      await sleep(50);
    }
    return { empties: [...document.querySelectorAll('.page .empty b')].map((b) => b.textContent), cards: document.querySelectorAll('.page .card').length, h1: document.querySelector('.page h1')!.textContent };
  });
  expect(ui.h1).toBe('工作台');
  expect(ui.cards).toBe(5); // 5 cards since the v0.5 skills card (agent-capabilities §12.3)
  expect(ui.empties).toContain('还没有 Agent 运行记录');
  expect(ui.empties).toContain('还没有定时任务运行记录');
});

test('after a chat run and a demo job run, both lists render with formatted rows', async () => {
  // 1. Fake-mode chat run -> one agent_runs row (source 'chat', sub-cent cost).
  await app.window.evaluate(async () => {
    const dones: unknown[] = [];
    const offDone = window.creatorOS.onAgentDone((r) => dones.push(r));
    try {
      await window.creatorOS.agent.run('检查各账号登录态');
      const deadline = Date.now() + 15_000;
      while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    } finally { offDone(); }
  });

  // 2. Demo job -> one job_runs row (no browser interaction, fully offline).
  const created = await gw.post('/api/jobs', { name: 'e2e-dashboard-demo', cron: '0 4 * * *', workflowType: 'demo', payload: {} });
  expect(created.status).toBe(201);
  const trigger = await gw.post(`/api/jobs/${(created.json as { id: string }).id}/run`);
  expect(trigger.status).toBe(200);

  // 3. Remount the dashboard so it refetches runsList(10), then read both lists.
  await openDashboard();
  const ui = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 100; i++) {
      const items = [...document.querySelectorAll('.page .content-item')];
      if (items.length >= 2) {
        const panels = [...document.querySelectorAll('.page .panel h2')].map((h) => h.textContent);
        return {
          panels,
          agentRow: items.find((it) => it.querySelector('b')?.textContent === '检查各账号登录态')?.textContent ?? '',
          jobRow: items.find((it) => it.querySelector('b')?.textContent === 'e2e-dashboard-demo')?.textContent ?? '',
        };
      }
      await sleep(50);
    }
    return {
      panels: [...document.querySelectorAll('.page .panel h2')].map((h) => h.textContent),
      agentRow: '', jobRow: '',
    };
  });
  expect(ui.panels).toContain('最近 Agent 运行');
  expect(ui.panels).toContain('最近定时任务运行');
  expect(ui.agentRow).toContain('对话');
  expect(ui.agentRow).toMatch(/<\$0\.01|\$\d/); // fmtCost: sub-cent collapses to <$0.01
  expect(ui.agentRow).toContain('成功');
  expect(ui.jobRow).toContain('e2e-dashboard-demo');
  expect(ui.jobRow).toContain('成功');
});

test('agent.runsList IPC returns the §7.2 contract shape', async () => {
  // Self-contained seed: this test's own chat run + demo job run.
  await app.window.evaluate(async () => {
    const dones: unknown[] = [];
    const offDone = window.creatorOS.onAgentDone((r) => dones.push(r));
    try {
      await window.creatorOS.agent.run('检查各账号登录态');
      const deadline = Date.now() + 15_000;
      while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    } finally { offDone(); }
  });
  const created = await gw.post('/api/jobs', { name: 'e2e-dashboard-shape', cron: '0 4 * * *', workflowType: 'demo', payload: {} });
  expect(created.status).toBe(201);
  const trigger = await gw.post(`/api/jobs/${(created.json as { id: string }).id}/run`);
  expect(trigger.status).toBe(200);
  await new Promise((r) => setTimeout(r, 300));

  const r = await app.window.evaluate(async () => window.creatorOS.agent.runsList(3));
  expect(Array.isArray(r.agentRuns)).toBe(true);
  expect(Array.isArray(r.jobRuns)).toBe(true);
  expect(r.agentRuns.length).toBeGreaterThan(0);
  expect(r.jobRuns.length).toBeGreaterThan(0);
  const run = r.agentRuns[0];
  expect(run.source).toBe('chat');
  expect(run.prompt).toBe('检查各账号登录态');
  expect(run.status).toBe('success');
  expect(run.ok).toBe(true);
  expect(typeof run.startedAt).toBe('number');
  expect(run.finishedAt).not.toBeNull();
  const jr = r.jobRuns[0];
  expect(jr.jobName).toBe('e2e-dashboard-shape');
  expect(jr.status).toBe('success');
  expect(jr.error).toBeNull();
  // Cross-check against the SQLite rows the handler reads.
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  try {
    const agentCount = (db.prepare('SELECT COUNT(*) AS n FROM agent_runs').get() as { n: number }).n;
    const jobRunCount = (db.prepare('SELECT COUNT(*) AS n FROM job_runs').get() as { n: number }).n;
    expect(agentCount).toBeGreaterThanOrEqual(r.agentRuns.length);
    expect(jobRunCount).toBeGreaterThanOrEqual(r.jobRuns.length);
  } finally { db.close(); }
});
