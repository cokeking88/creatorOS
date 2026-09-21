import cron, { type ScheduledTask } from 'node-cron';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import { repo } from '../db/repository.js';
import { rawSqlite } from '../db/index.js';
import { nanoid } from 'nanoid';
import { logger } from '../services/logger.js';
import type { ClaudeAgentService } from '../agent/claudeAgent.js';

export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private log = logger.child('scheduler');
  constructor(private browser: BrowserKernel, private agent: ClaudeAgentService) {}
  /** Create a persisted job and reload schedules (used by IPC and gateway). */
  createJob(input: { name: string; cron: string; workflowType: string; payload?: Record<string, unknown> }) {
    const job = repo.createJob(input);
    this.reload();
    return job;
  }
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
        const prompt = String(job.payload.prompt ?? '');
        if (!prompt) throw new Error('agent.run job requires payload.prompt');
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
