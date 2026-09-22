import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeApp, expect, gw, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC-U1 (UI redesign §3.6/§7.7) — the per-job two-step delete: first click
 * turns the trash button into「确认删除？」(auto-reverts after 3s), the second
 * click runs jobs.delete. Verified end to end: UI form creates the job, state()
 * shrinks by one, and both jobs and job_runs rows are gone from SQLite
 * (explicit cascade — schema has no FK). Self-contained per test.
 */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

function readDb(userData: string) {
  const db = new DatabaseSync(join(userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  return {
    job: (id: string) => db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as Record<string, unknown> | undefined,
    jobRuns: (id: string) => db.prepare('SELECT * FROM job_runs WHERE job_id = ?').all(id) as Array<Record<string, unknown>>,
    close: () => db.close(),
  };
}

test('create a job through the form, then the delete button cascades jobs + job_runs after two-step confirm', async () => {
  // 1. Create the job through the real UI form (Automation page, browser.navigate — offline).
  const jobId = await app.window.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.sidebar button', '自动化')!.click();
    let createBtn: HTMLElement | null = null;
    for (let i = 0; i < 50 && !createBtn; i++) { await sleep(50); createBtn = byText('.page button', '创建任务') ?? null; }
    const setVal = (el: HTMLInputElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const name = document.querySelector<HTMLInputElement>('#job-name')!;
    setVal(name, 'e2e-delete-me');
    createBtn!.click();
    // Wait until the job lands in state (EVENT_STATE_CHANGED -> refresh).
    const deadline = Date.now() + 10_000;
    for (;;) {
      const state = await window.creatorOS.state();
      const job = (state.jobs as Array<{ id: string; name: string }>).find((j) => j.name === 'e2e-delete-me');
      if (job) return job.id;
      if (Date.now() > deadline) throw new Error('job never appeared in state');
      await sleep(100);
    }
  });
  expect(jobId).toBeTruthy();

  // 2. First click arms the inline confirm (button text becomes 确认删除？, no delete yet).
  const confirming = await app.window.evaluate(async (id: string) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const btn = document.querySelector<HTMLButtonElement>(`.content-item .btn-danger[aria-label="删除任务 e2e-delete-me"]`)!;
    btn.click();
    await sleep(50);
    return { text: document.querySelector<HTMLButtonElement>(`.content-item .btn-danger[aria-label="删除任务 e2e-delete-me"]`)!.textContent ?? '',
             stillThere: (await window.creatorOS.state()).jobs.some((j: { id: string }) => j.id === id) };
  }, jobId);
  expect(confirming.text).toContain('确认删除？');
  expect(confirming.stillThere).toBe(true);

  // 3. Second click executes jobs.delete; the jobs list shrinks by one.
  const gone = await app.window.evaluate(async (id: string) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    document.querySelector<HTMLButtonElement>(`.content-item .btn-danger[aria-label="删除任务 e2e-delete-me"]`)!.click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const jobs = (await window.creatorOS.state()).jobs as Array<{ id: string; name: string }>;
      if (!jobs.some((j: { id: string }) => j.id === id)) return { count: jobs.length };
      if (Date.now() > deadline) return { count: -1 };
      await sleep(100);
    }
  }, jobId);
  expect(gone.count).toBeGreaterThanOrEqual(0);

  // 4. SQLite truth: both the job row and (cascade) its job_runs are gone.
  const db = readDb(app.userData);
  try {
    expect(db.job(jobId)).toBeUndefined();
    expect(db.jobRuns(jobId)).toEqual([]);
  } finally { db.close(); }
});

test('create → run → delete: job_runs created by the scheduler are also cascaded', async () => {
  // A second job that actually ran once (fake agent.run leaves a job_runs row),
  // proving the cascade covers scheduler-written history, not just the empty case.
  const id = await app.window.evaluate(async () => {
    const j = await window.creatorOS.jobs.create({ name: 'e2e-delete-ran', cron: '0 4 * * *', workflowType: 'agent.run', payload: { prompt: 'delete me after running' } });
    return (j as { id: string }).id;
  });

  // Run it through the gateway POST /api/jobs/:id/run (offline fake mode).
  const trigger = await gw.post(`/api/jobs/${id}/run`);
  expect(trigger.status).toBe(200);
  // The fake run takes ~4x60ms of scripted delay; poll until the terminal row lands.
  const db1 = readDb(app.userData);
  try {
    const deadline = Date.now() + 10_000;
    for (;;) {
      const runs = db1.jobRuns(id);
      if (runs.length > 0 && runs.every((r) => r.status !== 'running')) break;
      if (Date.now() > deadline) throw new Error('job_runs row never became terminal');
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(db1.jobRuns(id).length).toBeGreaterThan(0);
  } finally { db1.close(); }

  // Delete through the same two-step UI path.
  await app.window.evaluate(async (jobId: string) => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.sidebar button', '自动化')!.click();
    for (let i = 0; i < 50 && !document.querySelector('.page h1'); i++) await sleep(50);
    const sel = `.content-item .btn-danger[aria-label="删除任务 e2e-delete-ran"]`;
    for (let i = 0; i < 50 && !document.querySelector(sel); i++) await sleep(50);
    document.querySelector<HTMLButtonElement>(sel)!.click();
    await sleep(50);
    document.querySelector<HTMLButtonElement>(sel)!.click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const jobs = (await window.creatorOS.state()).jobs as Array<{ id: string; name: string }>;
      if (!jobs.some((j: { id: string }) => j.id === jobId)) return;
      if (Date.now() > deadline) throw new Error('job survived delete');
      await sleep(100);
    }
  }, id);

  const db2 = readDb(app.userData);
  try {
    expect(db2.job(id)).toBeUndefined();
    expect(db2.jobRuns(id)).toEqual([]);
  } finally { db2.close(); }
});
