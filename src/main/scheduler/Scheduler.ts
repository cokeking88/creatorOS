import cron, { type ScheduledTask } from 'node-cron';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import { repo } from '../db/repository.js';
import { rawSqlite } from '../db/index.js';
import type { SkillsRepo } from '../db/skillsRepo.js';
import { nanoid } from 'nanoid';
import { logger } from '../services/logger.js';
import type { ClaudeAgentService } from '../agent/claudeAgent.js';
import { isSupportedCron, CRON_ERROR_HINT } from '../../shared/cronNext.js';

/** Create-job input shape (IPC / Gateway / job_create tool all funnel into this). */
export type JobInput = { name: string; cron: string; workflowType: string; payload?: Record<string, unknown> };

/**
 * D6 authoritative gate (agent-capabilities §13.5): the strict cron vocabulary
 * and prompt/skillId mutual exclusion hold at ONE point — Scheduler.createJob —
 * so the tool handler and Gateway inherit them for free. Cron strictness is
 * universal (D6: every created job must be previewable in the UI); the payload
 * shape checks govern ONLY agent.run (§13.5: browser.navigate keeps its {url}
 * payload, demo keeps {}). The workflowType allowlist itself stays at the
 * tool/Gateway layer.
 */
export function validateJobInput(input: JobInput, skills: SkillsRepo) {
  if (!input.name?.trim()) throw new Error('name is required');
  if (!isSupportedCron(input.cron)) throw new Error(`cron is invalid. ${CRON_ERROR_HINT}`);
  if (input.workflowType !== 'agent.run') return;
  const p = input.payload ?? {};
  const hasPrompt = typeof p.prompt === 'string' && p.prompt.trim().length > 0;
  const hasSkill = typeof p.skillId === 'string' && p.skillId.length > 0;
  if (hasPrompt === hasSkill) throw new Error('agent.run job requires exactly one of payload.prompt or payload.skillId');
  if (hasSkill && !skills.get(p.skillId as string)) throw new Error(`skillId "${p.skillId}" does not exist`);
}

export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private log = logger.child('scheduler');
  constructor(private browser: BrowserKernel, private agent: ClaudeAgentService, private skills: SkillsRepo) {}
  /** Create a persisted job and reload schedules (used by IPC, gateway and the job_create tool — the only creation path). */
  createJob(input: JobInput) {
    validateJobInput(input, this.skills); // D6 authoritative gate — every creation mouth inherits
    const job = repo.createJob(input);
    this.reload();
    return job;
  }
  /** §13.8 route convergence: toggle/delete stay Scheduler methods so reload is never forgotten. */
  toggleJob(id: string, enabled: boolean) { repo.toggleJob(id, enabled); this.reload(); }
  deleteJob(id: string) { repo.deleteJob(id); this.reload(); }
  reload() { for (const t of this.tasks.values()) t.stop(); this.tasks.clear(); for (const job of repo.listJobs()) if (job.enabled && cron.validate(job.cron)) this.tasks.set(job.id, cron.schedule(job.cron, () => void this.run(job.id))); }
  async run(id: string) {
    const job = repo.listJobs().find(j=>j.id===id); if (!job) return;
    const runId=nanoid(); const started=Date.now(); rawSqlite().prepare('INSERT INTO job_runs(id,job_id,status,started_at) VALUES(?,?,?,?)').run(runId,id,'running',started);
    this.log.info('Job started', { jobId: id, runId, workflowType: job.workflowType });
    try {
      let output: unknown = { ok:true };
      if (job.workflowType === 'browser.navigate') { const url=String(job.payload.url ?? 'https://www.google.com'); await this.browser.navigate(url); output={navigated:url}; }
      else if (job.workflowType === 'demo') output={message:'demo workflow executed'};
      else if (job.workflowType === 'agent.run') {
        // Same engine as the chat panel: ClaudeAgentService.streamRun. Steps are
        // published on the agent StepBus (the AgentPanel sees them via its event
        // subscription; per-step debug logging happens in the service), so the
        // scheduler only records the terminal job_runs row here.
        // skillId reference semantics (§13.6): resolve the template at fire time —
        // editing the skill changes the job's behavior; a deleted skill fails the
        // run before streamRun, so only job_runs gets a row (no agent_runs, no steps).
        const p = job.payload as { prompt?: unknown; skillId?: unknown };
        let prompt: string;
        if (typeof p.skillId === 'string' && p.skillId) {
          const skill = this.skills.get(p.skillId);
          if (!skill) throw new Error('绑定的技能已被删除，请重新配置或删除该任务');
          prompt = skill.promptTemplate;
        } else {
          prompt = String(p.prompt ?? '');
          if (!prompt.trim()) throw new Error('agent.run job requires payload.prompt');
        }
        const result = await this.agent.streamRun(prompt, {
          runId,
          source: `cron:${job.name}`,
        });
        if (!result.ok) throw new Error(result.error ?? `agent run failed (${result.interrupted ? 'interrupted' : 'error'})`);
        output = { text: result.text, steps: result.stepCount, sessionId: result.sessionId };
      }
      else throw new Error(`Unsupported workflowType: ${job.workflowType}`);
      rawSqlite().prepare('UPDATE job_runs SET status=?,finished_at=?,output_json=? WHERE id=?').run('success',Date.now(),JSON.stringify(output),runId); repo.markJobRun(id);
      this.log.info('Job completed', { id, runId, output });
    } catch(e) { rawSqlite().prepare('UPDATE job_runs SET status=?,finished_at=?,error=? WHERE id=?').run('failed',Date.now(),String(e),runId); this.log.error('Job failed',{id,runId,error:String(e)}); }
  }
}
