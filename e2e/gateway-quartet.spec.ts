import { test } from '@playwright/test';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { closeApp, expect, gw, launchApp, waitForGateway, type Launched } from './helpers.js';

/**
 * AC-S8 gateway face (agent-capabilities §7.8/§13.4 D5): the four read-only GET
 * endpoints the external bridge forwards to. The bridge's HTTP *forwarding* is
 * vitest-covered (tests/bridge.test.ts, injected fetch); this spec proves the
 * REAL gateway routes exist and return the repo-backed shapes an external MCP
 * host would consume — GET /api/jobs | /api/contents | /api/accounts | /api/skills.
 * Offline fake mode; every test seeds its own data (worker-restart safe).
 */

let app: Launched;

test.beforeAll(async () => {
  app = await launchApp();
  await waitForGateway();
});

test.afterAll(async () => { await closeApp(app); });

test('GET quartet returns the repo-backed shapes: jobs with parsed payloads, contents filtered, accounts, skills', async () => {
  // Seed all four faces through the renderer IPC (the same faces the UI uses).
  const seeded = await app.window.evaluate(async () => {
    const skill = await window.creatorOS.skills.create({ name: 'e2e-gw-skill', description: '只读四件套', promptTemplate: '打开工作台并汇报' });
    await window.creatorOS.jobs.create({ name: 'e2e-gw-job', cron: '0 9 * * *', workflowType: 'agent.run', payload: { skillId: skill.id, prompt: null } });
    await window.creatorOS.content.create({ title: 'e2e-gw-draft', body: '', platform: 'douyin' });
    return { skillId: skill.id };
  });
  expect(seeded.skillId).toBeTruthy();

  // /api/jobs — repo.listJobs shape: payloadJson parsed into a payload object,
  // enabled boolean, and the v0.5 reference form {skillId, prompt:null}.
  const jobs = await gw.get('/api/jobs');
  expect(jobs.status).toBe(200);
  const job = (jobs.json as Array<{ id: string; name: string; cron: string; enabled: boolean; workflowType: string; payload: Record<string, unknown> }>).find((j) => j.name === 'e2e-gw-job');
  expect(job).toBeDefined();
  expect(job!.enabled).toBe(true);
  expect(job!.workflowType).toBe('agent.run');
  expect(job!.payload).toMatchObject({ skillId: seeded.skillId, prompt: null });

  // /api/contents — filterContents semantics: platform/status exact-match,
  // empty filters ignored (the bridge maps args onto the query string).
  let r = await gw.get('/api/contents');
  expect(r.status).toBe(200);
  expect((r.json as unknown[]).some((c) => (c as { title: string }).title === 'e2e-gw-draft')).toBe(true);
  r = await gw.get('/api/contents?platform=douyin');
  expect((r.json as Array<{ platform: string }>).length).toBeGreaterThan(0);
  for (const c of r.json as Array<{ platform: string }>) expect(c.platform).toBe('douyin');
  r = await gw.get('/api/contents?platform=nonsense');
  expect(r.json).toEqual([]);

  // /api/skills — SkillsRepo rows verbatim (the bridge tool descriptions
  // promise name/description/promptTemplate/origin/updatedAt).
  r = await gw.get('/api/skills');
  expect(r.status).toBe(200);
  const skill = (r.json as Array<{ id: string; name: string; promptTemplate: string; origin: string }>).find((s) => s.id === seeded.skillId);
  expect(skill).toMatchObject({ name: 'e2e-gw-skill', promptTemplate: '打开工作台并汇报', origin: 'manual' });

  // /api/accounts — repo.listAccounts shape (name/platformId/handle fields).
  r = await gw.get('/api/accounts');
  expect(r.status).toBe(200);
  expect(Array.isArray(r.json)).toBe(true);

  // Seed-data note: the seeded bound job was created through IPC, so the
  // on-disk payload must agree with the GET (same repo, same parse).
  const db = new DatabaseSync(join(app.userData, 'data', 'creatoros.sqlite'), { readOnly: true });
  try {
    const row = db.prepare(`SELECT payload_json FROM jobs WHERE name = 'e2e-gw-job'`).get() as { payload_json: string };
    expect(JSON.parse(row.payload_json)).toEqual({ skillId: seeded.skillId, prompt: null });
  } finally { db.close(); }
});

test('the quartet is read-only: no write/high-impact app route exists on the gateway', async () => {
  // D5 boundary on the HTTP face: only job creation/run survived from the
  // v0.4 POST surface; the app write tools (content_create/update via tools,
  // skill_create, job_delete, job_toggle) have NO gateway route. Fastify
  // answers 404 for unknown routes — probing the hypothetical mutations proves
  // the boundary rather than assuming it.
  for (const path of ['/api/skills', '/api/contents', '/api/accounts']) {
    // POST on a quartet path is not a route (only the GET is registered).
    const r = await gw.post(path, { name: 'x' });
    expect(r.status).toBe(404);
  }
});
