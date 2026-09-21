import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, gw, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC8 — cron agent.run jobs go through the SAME ClaudeAgentService as the chat
 * panel: steps flow on the same event stream (source 'cron:<jobName>'), both
 * agent_runs and job_runs land terminal rows, and the gateway validates job
 * payloads (400 on bad input). Fake mode, fully offline.
 *
 * Every test is self-contained: it creates its own job and runs it (a failed
 * test restarts the worker — no test may rely on a previous test's app state).
 */

let app: Launched;

test.beforeAll(async () => {
  // LOG_LEVEL=debug so the per-step 'Agent step' debug lines land in the ring
  // and are visible through the gateway logs endpoint (AC13's step trace).
  app = await launchApp(undefined, { LOG_LEVEL: 'debug' });
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

type Step = { runId: string; seq: number; type: string; tool?: string; source?: string };
type Done = { runId: string; sessionId: string | null; ok: boolean; text: string; stepCount: number; source?: string };

function readDb() {
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  return {
    agentRun: (runId: string) => db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as Record<string, unknown> | undefined,
    jobRun: (jobId: string) => db.prepare('SELECT * FROM job_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT 1').get(jobId) as Record<string, unknown> | undefined,
    close: () => db.close(),
  };
}

test('POST /api/jobs creates an agent.run job with a valid payload (201)', async () => {
  const r = await gw.post('/api/jobs', { name: 'e2e-agent-digest', cron: '*/30 * * * *', workflowType: 'agent.run', payload: { prompt: 'daily digest: summarize drafts' } });
  expect(r.status).toBe(201);
  expect(r.json).toMatchObject({ name: 'e2e-agent-digest', cron: '*/30 * * * *', workflowType: 'agent.run', enabled: true });
  expect((r.json as { payload: { prompt: string } }).payload.prompt).toBe('daily digest: summarize drafts');
  // The job is visible through the app state (scheduler reloaded it).
  const state = await app.window.evaluate(async () => window.creatorOS.state());
  const job = (state.jobs as Array<{ name: string; workflowType: string }>).find((j) => j.name === 'e2e-agent-digest');
  expect(job).toMatchObject({ workflowType: 'agent.run' });
});

test('invalid job payloads are rejected with 400 and never reach the scheduler', async () => {
  // agent.run missing prompt
  let r = await gw.post('/api/jobs', { name: 'no-prompt', cron: '*/5 * * * *', workflowType: 'agent.run', payload: {} });
  expect(r.status).toBe(400);
  expect(r.json).toMatchObject({ error: expect.stringContaining('prompt') });

  // agent.run with whitespace-only prompt
  r = await gw.post('/api/jobs', { name: 'blank-prompt', cron: '*/5 * * * *', workflowType: 'agent.run', payload: { prompt: '   ' } });
  expect(r.status).toBe(400);

  // bad cron expression
  r = await gw.post('/api/jobs', { name: 'bad-cron', cron: 'not a cron', workflowType: 'demo', payload: {} });
  expect(r.status).toBe(400);
  expect(r.json).toMatchObject({ error: expect.stringContaining('cron') });

  // unknown workflowType
  r = await gw.post('/api/jobs', { name: 'bad-type', cron: '*/5 * * * *', workflowType: 'legacy.chat', payload: {} });
  expect(r.status).toBe(400);
  expect(r.json).toMatchObject({ error: expect.stringContaining('workflowType') });

  // missing name
  r = await gw.post('/api/jobs', { cron: '*/5 * * * *', workflowType: 'demo', payload: {} });
  expect(r.status).toBe(400);
  expect(r.json).toMatchObject({ error: expect.stringContaining('name') });

  // None of the rejected shapes became a job.
  const state = await app.window.evaluate(async () => window.creatorOS.state());
  const names = (state.jobs as Array<{ name: string }>).map((j) => j.name);
  expect(names).not.toContain('no-prompt');
  expect(names).not.toContain('bad-type');
});

test('POST /api/jobs/:id/run triggers the shared engine: same event stream, both tables, cron source, agent logs', async () => {
  const created = await gw.post('/api/jobs', { name: 'e2e-agent-run-once', cron: '0 4 * * *', workflowType: 'agent.run', payload: { prompt: 'cron: open the workspace dashboard' } });
  expect(created.status).toBe(201);
  const job = created.json as { id: string; name: string };

  // Subscribe in the renderer BEFORE triggering: cron runs publish on the same
  // StepBus the chat panel subscribes to (AC8's "same event stream" assertion).
  // Collectors live on window so the trigger can come from the spec process via
  // the gateway HTTP API, then be polled in a second evaluate call.
  await app.window.evaluate(() => {
    const w = window as unknown as { __e2eSteps: Step[]; __e2eDone: Done[]; __e2eOff: () => void };
    w.__e2eSteps = [];
    w.__e2eDone = [];
    const offStep = window.creatorOS.onAgentStep((s) => w.__e2eSteps.push(s));
    const offDone = window.creatorOS.onAgentDone((r) => w.__e2eDone.push(r));
    w.__e2eOff = () => { offStep(); offDone(); };
  });

  const trigger = await gw.post(`/api/jobs/${job.id}/run`);
  expect(trigger.status).toBe(200);
  expect(trigger.json).toEqual({ ok: true });

  const { steps, done } = await app.window.evaluate(async (): Promise<{ steps: Step[]; done: Done | null }> => {
    const w = window as unknown as { __e2eSteps: Step[]; __e2eDone: Done[] };
    const deadline = Date.now() + 15_000;
    while (w.__e2eDone.length === 0 && Date.now() < deadline) await new Promise((res) => setTimeout(res, 50));
    return { steps: w.__e2eSteps, done: w.__e2eDone[0] ?? null };
  });
  await app.window.evaluate(() => {
    (window as unknown as { __e2eOff: () => void }).__e2eOff();
  });

  // Same run, same event stream: the done payload identifies the cron run.
  expect(steps.length).toBeGreaterThanOrEqual(4);
  expect(done).not.toBeNull();
  const terminal = done!;
  expect(terminal.ok).toBe(true);
  expect(terminal.source).toBe(`cron:${job.name}`);
  expect(terminal.stepCount).toBe(steps.length);

  // Every streamed step carries the cron source, one runId, and the scripted order.
  for (const s of steps) {
    expect(s.runId).toBe(terminal.runId);
    expect(s.source).toBe(`cron:${job.name}`);
  }
  const seqs = steps.map((s) => s.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(steps.map((s) => s.type)).toEqual(['tool_start', 'tool_result', 'text', 'done']);

  const db = readDb();
  try {
    // agent_runs: the cron-triggered run left a full audit row with source+prompt.
    const run = db.agentRun(terminal.runId);
    expect(run).toBeDefined();
    expect(run!.status).toBe('success');
    expect(run!.provider).toBe('claude-code');
    expect(run!.session_id).toMatch(/^fake-session-/);
    const input = JSON.parse(run!.input_json as string) as { prompt: string; source: string };
    expect(input).toEqual({ prompt: 'cron: open the workspace dashboard', source: `cron:${job.name}` });

    // job_runs: success with output_json containing text/steps/sessionId.
    const jr = db.jobRun(job.id);
    expect(jr).toBeDefined();
    expect(jr!.status).toBe('success');
    expect(jr!.finished_at).not.toBeNull();
    const output = JSON.parse(jr!.output_json as string) as { text: string; steps: number; sessionId: string };
    expect(output.text).toBe('Fake agent processed: cron: open the workspace dashboard');
    expect(output.steps).toBeGreaterThanOrEqual(4);
    expect(output.sessionId).toBe(terminal.sessionId);
  } finally {
    db.close();
  }

  // AC13 (gateway face): the agent-module logs trace this cron run end to end —
  // started/finished info lines plus the per-step debug lines (LOG_LEVEL=debug).
  const r = await gw.get('/api/logs?module=agent');
  expect(r.status).toBe(200);
  const entries = r.json.entries as Array<{ module: string; level: string; message: string; meta?: Record<string, unknown> }>;
  expect(entries.length).toBeGreaterThan(0);
  for (const e of entries) expect(e.module).toBe('agent');
  const started = entries.find((e) => e.message === 'Agent run started' && e.meta?.runId === terminal.runId);
  expect(started).toBeTruthy();
  expect(started!.meta!.source).toBe(`cron:${job.name}`);
  const finished = entries.find((e) => e.message === 'Agent run finished' && e.meta?.runId === terminal.runId);
  expect(finished).toBeTruthy();
  const stepLines = entries.filter((e) => e.message === 'Agent step' && e.meta?.runId === terminal.runId);
  expect(stepLines.length).toBeGreaterThanOrEqual(4);
});
