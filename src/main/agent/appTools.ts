/**
 * creatoros-app SDK host (agent-capabilities spec §13.2): wires APP_TOOL_DEFS
 * to handlers with injected deps. Design points:
 *  - Reads go straight to repo; EVERY write goes through the Scheduler
 *    instance (createJob/toggleJob/deleteJob — reload semantics folded in,
 *    §13.8) so a write can never land without the schedule being rebuilt.
 *  - job_toggle/job_delete pre-check with requireJob: repo update/delete is
 *    idempotent-silent on a missing id, which would hand the agent a fake
 *    {ok:true}.
 *  - job_create validates prompt/skillId mutual exclusion here (friendly
 *    error listing available skills — the model can self-heal) AND
 *    Scheduler.createJob's validateJobInput backs it as an invariant.
 *  - skill_create hardcodes origin:'agent' (§13.1 trust boundary: client
 *    input never decides origin).
 *  - onChange (injected broadcast -> EVENT_STATE_CHANGED) fires only when a
 *    write handler returns successfully (iron rule 2, §8).
 *  - repository / Scheduler are type-only imports — zero runtime coupling;
 *    logger and the SDK `tool` helper are plain node imports, so vitest can
 *    construct and call handlers directly with fake deps (§13.9).
 */
import { tool } from '@anthropic-ai/claude-agent-sdk';
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { nextRunAt, isSupportedCron, CRON_ERROR_HINT } from '../../shared/cronNext.js';
import { APP_TOOL_DEFS, filterContents, jobPayloadSummary } from './appToolDefs.js';
import { out } from './browserTools.js';
import type { ContentItem } from '../../shared/types.js';
import type { SkillsRepo } from '../db/skillsRepo.js';
import type { Scheduler } from '../scheduler/Scheduler.js';
import type { repo as repoType } from '../db/repository.js';
import { logger } from '../services/logger.js';

/** The heterogeneous tool list is typed at the erased raw-shape level — APP_TOOL_DEFS keeps the per-tool schemas single-sourced. */
export type AppTool = SdkMcpToolDefinition<z.ZodRawShape>;

export type AppToolsDeps = {
  repo: Pick<typeof repoType, 'listJobs' | 'listContents' | 'listAccounts' | 'createContent' | 'updateContent'>;
  scheduler: Pick<Scheduler, 'createJob' | 'toggleJob' | 'deleteJob'>;
  skills: SkillsRepo;
  /** 铁律 2 落点：工厂层统一广播——写 handler 成功返回才触发，throw 不触发。 */
  onChange: () => void;
};

export function createAppTools(deps: AppToolsDeps): AppTool[] {
  const log = logger.child('appTools');
  const requireJob = (id: string) => {
    const j = deps.repo.listJobs().find((x) => x.id === id);
    if (!j) throw new Error(`job not found: ${id}. Call job_list for current job ids.`);
    return j;
  };
  const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
  const handlers: Record<string, (a: Record<string, unknown>) => Promise<unknown>> = {
    // Read-only four (job_list enriches each row with skill name/prompt preview + nextRunAt).
    job_list: async () => {
      const skills = deps.skills.list();
      return deps.repo.listJobs().map((j) => ({ ...j, ...jobPayloadSummary(j, skills), nextRunAt: nextRunAt(j.cron) }));
    },
    content_list: async (a) => filterContents(deps.repo.listContents(), a),
    account_list: async () => deps.repo.listAccounts(),
    skill_list: async () => deps.skills.list(),
    // Write: job_create (mutual exclusion in handler; dangling skillId error lists available skills)
    job_create: async (a) => {
      const prompt = str(a.prompt);
      const skillId = str(a.skillId);
      // Friendly cron gate first (§13.5.3): the handler's error is aimed at model
      // self-healing; Scheduler.createJob's validateJobInput is the invariant backstop.
      if (!isSupportedCron(str(a.cron) ?? '')) throw new Error(`cron is invalid. ${CRON_ERROR_HINT}`);
      const hasPrompt = typeof prompt === 'string' && prompt.trim().length > 0;
      const hasSkill = typeof skillId === 'string' && skillId.length > 0;
      if (hasPrompt === hasSkill) throw new Error('Exactly one of prompt or skillId is required for job_create.');
      if (hasSkill && !deps.skills.get(skillId)) {
        const avail = deps.skills.list().map((s) => `${s.name} (${s.id})`).join(', ') || 'the library is empty';
        throw new Error(`skillId "${skillId}" does not exist. Available skills: ${avail}. Call skill_list to inspect them.`);
      }
      const job = deps.scheduler.createJob({ name: (a.name as string).trim(), cron: a.cron as string, workflowType: 'agent.run',
        payload: hasSkill ? { skillId, prompt: null } : { prompt, skillId: null } });
      return { ok: true, job: { id: job.id, name: job.name, cron: job.cron, enabled: job.enabled, nextRunAt: nextRunAt(job.cron) } };
    },
    job_toggle: async (a) => { requireJob(a.jobId as string); deps.scheduler.toggleJob(a.jobId as string, a.enabled as boolean); return { ok: true }; },
    job_delete: async (a) => {
      const j = requireJob(a.jobId as string);
      deps.scheduler.deleteJob(a.jobId as string);
      // Second line of defense with the §13.3 hook gate: the hook logs the attempt, this logs the successful execution.
      log.warn('job_delete executed', { jobId: a.jobId, jobName: j.name });
      return { ok: true };
    },
    content_create: async (a) => deps.repo.createContent(a as Parameters<typeof deps.repo.createContent>[0]),
    content_update: async (a) => {
      const c = deps.repo.listContents().find((x) => x.id === a.contentId);
      if (!c) throw new Error(`content not found: ${a.contentId}`); // updateContent is silent on a missing id — the tool surface must report it
      const patch: Parameters<typeof deps.repo.updateContent>[1] = {};
      if (a.title !== undefined) patch.title = str(a.title);
      if (a.body !== undefined) patch.body = str(a.body);
      if (a.status !== undefined) patch.status = a.status as ContentItem['status'];
      if (a.scheduledAt !== undefined) patch.scheduledAt = a.scheduledAt as number | null;
      if (a.publishedUrl !== undefined) patch.publishedUrl = a.publishedUrl as string | null;
      deps.repo.updateContent(a.contentId as string, patch);
      return { ok: true };
    },
    skill_create: async (a) => deps.skills.create({ name: str(a.name) ?? '', description: str(a.description), promptTemplate: str(a.promptTemplate) ?? '', origin: 'agent' }), // origin hardcoded (§13.1)
  };
  return APP_TOOL_DEFS.map((d) => tool(d.name, d.description, d.shape, async (a) => {
    const result = await handlers[d.name](a as Record<string, unknown>);
    if (!d.readOnly) deps.onChange();
    return out(result);
  }, { annotations: d.readOnly ? { readOnlyHint: true } : undefined }) as AppTool);
}
