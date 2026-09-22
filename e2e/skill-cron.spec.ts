import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeApp, expect, gw, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC-S3/AC-S4 (agent-capabilities §7.2) — skillId reference semantics
 * (§2.4 方案 A) through the real Automation page:
 *   1. create skill -> bind via the「选技能」segmented control -> trigger via
 *      gateway -> agent_runs.input_json.prompt === template, source 'cron:<name>';
 *   2. edit the template -> trigger again -> the new prompt is the NEW template
 *      (editing a skill changes the job's behavior — the core §2.4 assertion);
 *   3. delete the skill -> trigger -> job_runs failed with the「绑定的技能已被删除」
 *      error; the job row survives (no cascade); the Automation task row shows
 *      the「技能已删除」pill (§12.3/§12.5 #25).
 * Offline fake mode; self-contained per test.
 */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp(undefined, { LOG_LEVEL: 'debug' });
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

type Step = { runId: string; seq: number; type: string; source?: string };
type Done = { runId: string; ok: boolean; stepCount: number; source?: string };

function readDb() {
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  return {
    agentRuns: () => db.prepare('SELECT id, input_json FROM agent_runs ORDER BY started_at DESC').all() as Array<{ id: string; input_json: string }>,
    jobRun: (jobId: string) => db.prepare('SELECT * FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT 1').get(jobId) as Record<string, unknown> | undefined,
    close: () => db.close(),
  };
}

/** Subscribe step+done collectors in the renderer, return an unsubscribe handle. */
async function subscribe(): Promise<void> {
  await app.window.evaluate(() => {
    const w = window as unknown as { __e2eSteps: Step[]; __e2eDone: Done[]; __e2eOff: () => void };
    w.__e2eSteps = [];
    w.__e2eDone = [];
    const offStep = window.creatorOS.onAgentStep((s) => w.__e2eSteps.push(s));
    const offDone = window.creatorOS.onAgentDone((r) => w.__e2eDone.push(r));
    w.__e2eOff = () => { offStep(); offDone(); };
  });
}

/** Poll until a done event lands; return the collected steps + first done. */
async function collect(): Promise<{ steps: Step[]; done: Done | null }> {
  return app.window.evaluate(async (): Promise<{ steps: Step[]; done: Done | null }> => {
    const w = window as unknown as { __e2eSteps: Step[]; __e2eDone: Done[] };
    const deadline = Date.now() + 15_000;
    while (w.__e2eDone.length === 0 && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    return { steps: w.__e2eSteps, done: w.__e2eDone[0] ?? null };
  });
}

async function unsubscribe(): Promise<void> {
  await app.window.evaluate(() => { (window as unknown as { __e2eOff: () => void }).__e2eOff(); });
}

/** Create the skill + bound job through the real Automation page (选技能 branch). */
async function createBoundJobThroughUi(): Promise<{ skillId: string; jobId: string }> {
  return app.window.evaluate(async (): Promise<{ skillId: string; jobId: string }> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    // 1. Skill through the skills page form (UI face; IPC face covered elsewhere).
    byText('.sidebar button', '技能')!.click();
    for (let i = 0; i < 50 && document.querySelector('.page h1')?.textContent !== '技能'; i++) await sleep(50);
    const setVal = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
      const proto = el instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(document.querySelector<HTMLInputElement>('#skill-name')!, 'e2e-skill-cron');
    setVal(document.querySelector<HTMLTextAreaElement>('#skill-template')!, 'cron: 打开工作台并汇报登录态');
    ([...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存技能') as HTMLElement).click();
    let skillId = '';
    const dl1 = Date.now() + 10_000;
    for (;;) {
      const s = ((await window.creatorOS.state()).skills as Array<{ id: string; name: string }>).find((x) => x.name === 'e2e-skill-cron');
      if (s) { skillId = s.id; break; }
      if (Date.now() > dl1) throw new Error('skill never appeared');
      await sleep(100);
    }
    // 2. Automation page: agent.run + 选技能 branch -> payload {skillId}.
    byText('.sidebar button', '自动化')!.click();
    for (let i = 0; i < 50 && !document.querySelector('#job-name'); i++) await sleep(50);
    const setNativeSelect = (sel: HTMLSelectElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
      setter.call(sel, v);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal(document.querySelector<HTMLInputElement>('#job-name')!, 'e2e-skill-job');
    // The workflow select is found by its agent.run option (cron template select is the other .field select).
    const wfSelect = [...document.querySelectorAll<HTMLSelectElement>('.page select.field')].find((s) => [...s.options].some((o) => o.value === 'agent.run'))!;
    setNativeSelect(wfSelect, 'agent.run');
    await sleep(50);
    // Switch to 选技能 and pick the skill.
    byText('.seg-opt', '选技能')!.click();
    await sleep(50);
    const skillSelect = document.querySelector<HTMLSelectElement>('select[aria-label="选择技能"]')!;
    setNativeSelect(skillSelect, skillId);
    await sleep(50);
    ([...document.querySelectorAll('.page button')].find((b) => b.textContent === '创建任务') as HTMLElement).click();
    const dl2 = Date.now() + 10_000;
    for (;;) {
      const job = ((await window.creatorOS.state()).jobs as Array<{ id: string; name: string }>).find((j) => j.name === 'e2e-skill-job');
      if (job) return { skillId, jobId: job.id };
      if (Date.now() > dl2) throw new Error('bound job never appeared');
      await sleep(100);
    }
  });
}

test('bind a skill to a cron job via the UI; trigger resolves the template at fire time (AC-S3)', async () => {
  const { skillId, jobId } = await createBoundJobThroughUi();

  // payload persisted with the reference shape (both keys, exactly one non-null).
  const state = await app.window.evaluate(async () => window.creatorOS.state());
  const job = (state.jobs as Array<{ id: string; payload: Record<string, unknown> }>).find((j) => j.id === jobId)!;
  expect(job.payload).toMatchObject({ skillId, prompt: null });

  // Task row displays 技能：{name} (§12.5 #27).
  const row = await app.window.evaluate(() => {
    const item = [...document.querySelectorAll('.content-item')].find((it) => it.querySelector('b')?.textContent === 'e2e-skill-job');
    return item?.textContent ?? '';
  });
  expect(row).toContain('技能：e2e-skill-cron');

  // Trigger through the gateway and collect the run.
  await subscribe();
  const trigger = await gw.post(`/api/jobs/${jobId}/run`);
  expect(trigger.status).toBe(200);
  const { steps, done } = await collect();
  await unsubscribe();

  expect(done).not.toBeNull();
  expect(done!.ok).toBe(true);
  expect(done!.source).toBe('cron:e2e-skill-job');
  expect(steps.length).toBeGreaterThanOrEqual(4);

  // agent_runs.input_json.prompt === the skill template, source === 'cron:<jobName>'.
  const db = readDb();
  try {
    const run = db.agentRuns().find((r) => r.id === done!.runId);
    expect(run).toBeDefined();
    const input = JSON.parse(run!.input_json) as { prompt: string; source: string };
    expect(input).toEqual({ prompt: 'cron: 打开工作台并汇报登录态', source: 'cron:e2e-skill-job' });
    const jr = db.jobRun(jobId);
    expect(jr).toBeDefined();
    expect(jr!.status).toBe('success');
  } finally { db.close(); }
});

test('editing the skill template changes the job behavior (AC-S4 reference semantics)', async () => {
  const { skillId, jobId } = await createBoundJobThroughUi();

  // Edit the template through the skills page (update IPC face).
  await app.window.evaluate(async (id: string): Promise<void> => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.sidebar button', '技能')!.click();
    for (let i = 0; i < 50 && document.querySelector('.page h1')?.textContent !== '技能'; i++) await sleep(50);
    byText('.skill-item-actions button', '编辑')!.click();
    await sleep(50);
    const setVal = (el: HTMLTextAreaElement, v: string) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setVal(document.querySelector<HTMLTextAreaElement>('#skill-template')!, 'cron: 修改后的新模板，检查草稿库');
    ([...document.querySelectorAll('.page button')].find((b) => b.textContent === '保存修改') as HTMLElement).click();
    const deadline = Date.now() + 10_000;
    for (;;) {
      const s = ((await window.creatorOS.state()).skills as Array<{ id: string; promptTemplate: string }>).find((x) => x.id === id);
      if (s && s.promptTemplate === 'cron: 修改后的新模板，检查草稿库') return;
      if (Date.now() > deadline) throw new Error('template update never landed');
      await sleep(100);
    }
  }, skillId);

  // Trigger again: the new run must carry the NEW template text.
  await subscribe();
  const trigger = await gw.post(`/api/jobs/${jobId}/run`);
  expect(trigger.status).toBe(200);
  const { done } = await collect();
  await unsubscribe();
  expect(done).not.toBeNull();
  const db = readDb();
  try {
    const run = db.agentRuns().find((r) => r.id === done!.runId);
    expect(run).toBeDefined();
    const input = JSON.parse(run!.input_json) as { prompt: string };
    expect(input.prompt).toBe('cron: 修改后的新模板，检查草稿库');
  } finally { db.close(); }
});

test('deleting the bound skill fails the next run with the explicit error; job survives; UI shows the dangling pill (AC-S4)', async () => {
  const { skillId, jobId } = await createBoundJobThroughUi();

  // Delete the skill through the IPC face (two-step UI path covered in skills-page.spec).
  await app.window.evaluate(async (id: string): Promise<void> => {
    await window.creatorOS.skills.delete(id);
    const deadline = Date.now() + 10_000;
    for (;;) {
      const skills = (await window.creatorOS.state()).skills as Array<{ id: string }>;
      if (!skills.some((s) => s.id === id)) return;
      if (Date.now() > deadline) throw new Error('skill delete never landed');
      await new Promise((r) => setTimeout(r, 100));
    }
  }, skillId);

  // Trigger: the run fails BEFORE streamRun — only a job_runs row, no agent_runs.
  const trigger = await gw.post(`/api/jobs/${jobId}/run`);
  expect(trigger.status).toBe(200);

  const db = readDb();
  try {
    // Poll until the failed row lands.
    const deadline = Date.now() + 10_000;
    let jr: Record<string, unknown> | undefined;
    for (;;) {
      jr = db.jobRun(jobId);
      if (jr && jr.status === 'failed') break;
      if (Date.now() > deadline) throw new Error('job_runs never became failed');
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(String(jr!.error)).toContain('绑定的技能已被删除，请重新配置或删除该任务');
    // The job row itself survives (delete does not cascade into jobs).
    const jobStillThere = await app.window.evaluate(async (id: string) =>
      ((await window.creatorOS.state()).jobs as Array<{ id: string }>).some((j) => j.id === id), jobId);
    expect(jobStillThere).toBe(true);
  } finally { db.close(); }

  // UI face: the Automation task row shows the 技能已删除 pill + title (§12.5 #25).
  const pill = await app.window.evaluate(() => {
    const byText = (sel: string, text: string) =>
      [...document.querySelectorAll<HTMLElement>(sel)].find((b) => b.textContent!.includes(text));
    byText('.sidebar button', '自动化')!.click();
    return new Promise<{ text: string | null; title: string | null }>((resolve) => {
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      (async () => {
        for (let i = 0; i < 50 && !document.querySelector('.content-item .pill.warn'); i++) await sleep(50);
        const el = document.querySelector('.content-item .pill.warn');
        resolve({ text: el?.textContent ?? null, title: el?.getAttribute('title') ?? null });
      })();
    });
  });
  expect(pill.text).toBe('技能已删除');
  expect(pill.title).toBe('绑定的技能已被删除，请重新配置或删除该任务');
});
