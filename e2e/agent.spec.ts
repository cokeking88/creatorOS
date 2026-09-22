import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC1/AC3/AC4/AC9/AC13 (offline, CREATOROS_FAKE_CLAUDE=1 injected by launchApp).
 * The fake run replays a deterministic 4-message script through the same
 * stepTranslator as a real SDK run, so these assertions hold the whole
 * run -> bus -> IPC -> renderer chain accountable.
 *
 * Self-containment rule (VERIFICATION.md): every test collects its own run;
 * nothing depends on a previous test's renderer state.
 */

let app: Launched;

test.beforeAll(async () => {
  // LOG_LEVEL=debug so the per-step 'Agent step' debug lines land in the ring
  // and are visible via logs.list (AC13 step trace).
  app = await launchApp(undefined, { LOG_LEVEL: 'debug' });
  await waitForGateway();
});

test.afterAll(async () => { await app.electronApp.close(); });

type Step = {
  runId: string; seq: number; time: number; type: string;
  tool?: string; inputText?: string; detail?: string; ok?: boolean;
  text?: string; msgUuid?: string; durationMs?: number; source?: string;
};
type Done = {
  runId: string; sessionId: string | null; ok: boolean; text: string; stepCount: number;
  costUsd?: number | null; durationMs?: number | null; error?: string | null; interrupted?: boolean; source?: string;
};

/** Start a run in the renderer and collect its steps + terminal done event. */
async function runAndCollect(prompt: string, resume?: string): Promise<{ runId: string; steps: Step[]; done: Done | null }> {
  const out = await app.window.evaluate(async ([promptArg, resumeArg]: [string, string | undefined]): Promise<{ runId: string; steps: Step[]; done: Done | null }> => {
    const steps: Step[] = [];
    const dones: Done[] = [];
    const offStep = window.creatorOS.onAgentStep((s) => steps.push(s));
    const offDone = window.creatorOS.onAgentDone((r) => dones.push(r));
    try {
      const { runId } = await window.creatorOS.agent.run(promptArg, resumeArg);
      const deadline = Date.now() + 15_000;
      while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      return { runId, steps, done: dones[0] ?? null };
    } finally {
      offStep();
      offDone();
    }
  }, [prompt, resume] as [string, string | undefined]);
  return out;
}

type AgentRunRow = {
  id: string; provider: string; status: string; input_json: string; output_json: string | null;
  started_at: number; finished_at: number | null; error: string | null;
  session_id: string | null; steps_json: string | null; cost_usd: number | null; duration_ms: number | null;
};

/**
 * Read a committed row straight from SQLite. The app holds the DB open in WAL
 * mode; a fresh read-only connection from the spec process sees committed data.
 * (electronApp.evaluate cannot dynamically import — read from the spec side.)
 */
function readAgentRun(userData: string, runId: string): AgentRunRow | undefined {
  const db = new DatabaseSync(join(userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  try {
    return db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(runId) as AgentRunRow | undefined;
  } finally {
    db.close();
  }
}

test('agent.run returns {runId} immediately (before any step arrives)', async () => {
  // Collect the run to completion so the next test's collector never sees this
  // run's steps (tests must be self-contained; worker reruns afterAll+beforeAll
  // but a same-worker later test shares this renderer).
  const { runId, done } = await app.window.evaluate(async (): Promise<{ runId: string; done: unknown }> => {
    const dones: unknown[] = [];
    const offDone = window.creatorOS.onAgentDone((r) => dones.push(r));
    try {
      const t0 = Date.now();
      const { runId } = await window.creatorOS.agent.run('immediate return probe');
      const elapsed = Date.now() - t0;
      const deadline = Date.now() + 15_000;
      while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      return { runId, done: { elapsed, terminal: dones[0] ?? null } };
    } finally {
      offDone();
    }
  });
  const { elapsed } = done as { elapsed: number; terminal: unknown };
  expect(typeof runId).toBe('string');
  expect(runId.length).toBeGreaterThan(0);
  // The fake run takes >= 4 x 60ms of scripted delay, so an immediate return
  // proves the invoke is decoupled from run completion (arch spec §1.2).
  expect(elapsed).toBeLessThan(240);
});

test('steps stream in order tool_start -> tool_result -> text -> done with consistent runId and seq', async () => {
  const { runId, steps } = await runAndCollect('open the drafts dashboard');
  expect(steps.length).toBeGreaterThanOrEqual(4);
  const types = steps.map((s) => s.type);
  expect(types).toEqual(['tool_start', 'tool_result', 'text', 'done']);

  // runId/seq consistency: every step belongs to this run, seq strictly monotonic.
  for (const s of steps) expect(s.runId).toBe(runId);
  const seqs = steps.map((s) => s.seq);
  expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  expect(new Set(seqs).size).toBe(seqs.length);

  // tool_start: the browser tool with serialized input.
  const [start, result] = steps;
  expect(start.tool).toBe('mcp__creatoros-browser__browser_navigate');
  expect(start.inputText).toContain('https://example.com');

  // tool_result: ok:true, detail payload, and a paired durationMs (translator-computed).
  expect(result.ok).toBe(true);
  expect(result.detail).toContain('"ok":true');
  expect(typeof result.durationMs).toBe('number');
  expect(result.durationMs!).toBeGreaterThanOrEqual(0);

  // done step detail carries the cost/duration JSON from the scripted result.
  const doneDetail = JSON.parse(steps[3].detail!);
  expect(doneDetail.subtype).toBe('success');

  // Steps are enriched with the chat source (cron runs carry 'cron:<name>' instead).
  for (const s of steps) expect(s.source).toBe('chat');
});

test('onAgentDone resolves ok:true with a fake sessionId; agent_runs row is a complete success audit record', async () => {
  const { runId, steps, done } = await runAndCollect('audit me');
  expect(done).not.toBeNull();
  expect(done!.ok).toBe(true);
  expect(done!.interrupted).toBeUndefined();
  expect(done!.sessionId).toMatch(/^fake-session-/);
  expect(done!.stepCount).toBe(steps.length);

  // agent_runs audit row (AC9): success, provider, session, input_json with source+prompt,
  // output_json with text/steps/sessionId, steps_json non-empty, finished_at set.
  const row = readAgentRun(app.userData, runId);
  expect(row).toBeDefined();
  expect(row!.provider).toBe('claude-code');
  expect(row!.status).toBe('success');
  expect(row!.session_id).toBe(done!.sessionId);
  expect(row!.finished_at).not.toBeNull();
  expect(row!.error).toBeNull();
  const input = JSON.parse(row!.input_json) as { prompt: string; source: string };
  expect(input.prompt).toBe('audit me');
  expect(input.source).toBe('chat');
  const output = JSON.parse(row!.output_json!) as { text: string; steps: number; sessionId: string };
  expect(output.text).toContain('audit me');
  expect(output.steps).toBe(steps.length);
  expect(output.sessionId).toBe(done!.sessionId);
  const stepsJson = JSON.parse(row!.steps_json!) as Array<{ type: string; seq: number }>;
  expect(stepsJson.length).toBe(steps.length);
  expect(stepsJson.map((s) => s.type)).toEqual(['tool_start', 'tool_result', 'text', 'done']);
});

test('stop mid-run interrupts: done carries ok:false/interrupted:true and agent_runs lands failed, never running', async () => {
  const { runId, stopped, done: terminal } = await app.window.evaluate(async (): Promise<{ runId: string; stopped: boolean; done: Done | null }> => {
    const dones: Done[] = [];
    const offDone = window.creatorOS.onAgentDone((r) => dones.push(r));
    try {
      const { runId } = await window.creatorOS.agent.run('long enough to stop');
      const stopped = await window.creatorOS.agent.stop(runId);
      const deadline = Date.now() + 15_000;
      while (dones.length === 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
      return { runId, stopped, done: dones[0] ?? null };
    } finally {
      offDone();
    }
  });
  expect(runId).toBeTruthy();
  expect(stopped).toBe(true);
  expect(terminal).not.toBeNull();
  expect(terminal!.ok).toBe(false);
  expect(terminal!.interrupted).toBe(true);

  // stop() on an already-finished runId returns false (registry unregistered in finally).
  const second = await app.window.evaluate(async (rid: string) => window.creatorOS.agent.stop(rid), runId);
  expect(second).toBe(false);

  // AC3/AC9: interrupted run lands failed with a non-empty error and never stays 'running'.
  const row = readAgentRun(app.userData, runId);
  expect(row).toBeDefined();
  expect(row!.status).toBe('failed');
  expect(row!.error).not.toBeNull();
  expect(row!.finished_at).not.toBeNull();
  // And stop() on a random unknown runId also returns false.
  const unknown = await app.window.evaluate(async () => window.creatorOS.agent.stop('no-such-run'));
  expect(unknown).toBe(false);
});

test('resume: a second run with the first sessionId still completes and keeps the session', async () => {
  const first = await runAndCollect('first turn');
  expect(first.done!.ok).toBe(true);
  const sessionId = first.done!.sessionId!;
  expect(sessionId).toMatch(/^fake-session-/);

  // Second turn passes the first run's sessionId (fake echoes resumeSessionId).
  const second = await runAndCollect('second turn, continuing', sessionId);
  expect(second.done).not.toBeNull();
  expect(second.done!.ok).toBe(true);
  expect(second.done!.sessionId).toBe(sessionId);

  // Both agent_runs rows report the same session_id (AC4 passthrough assertion).
  const rowA = readAgentRun(app.userData, first.runId);
  const rowB = readAgentRun(app.userData, second.runId);
  expect(rowA!.session_id).toBe(sessionId);
  expect(rowB!.session_id).toBe(sessionId);
});

test('agent module logs carry run started/finished lines with the runId (AC13)', async () => {
  const { runId } = await runAndCollect('log me');
  const logs = await app.window.evaluate(async () => window.creatorOS.logs.list({ module: 'agent', limit: 200 }));
  const entries = logs.entries as Array<{ module: string; message: string; meta?: { runId?: string; source?: string } }>;
  for (const e of entries) expect(e.module).toBe('agent');
  const started = entries.find((e) => e.message === 'Agent run started' && e.meta?.runId === runId);
  const finished = entries.find((e) => e.message === 'Agent run finished' && e.meta?.runId === runId);
  expect(started).toBeTruthy();
  expect(started!.meta?.source).toBe('chat');
  expect(finished).toBeTruthy();
  expect(finished!.meta).toBeTruthy();
  // Per-step debug logging exists too (level filter returns debug rows for this run).
  const debugRows = await app.window.evaluate(
    async (rid: string) => {
      const r = await window.creatorOS.logs.list({ module: 'agent', level: 'debug', limit: 200 });
      return (r.entries as Array<{ message: string; meta?: { runId?: string; seq?: number } }>).filter((e) => e.meta?.runId === rid);
    },
    runId,
  );
  expect(debugRows.length).toBeGreaterThanOrEqual(4);
  expect(debugRows.every((e) => e.message === 'Agent step')).toBe(true);
});
