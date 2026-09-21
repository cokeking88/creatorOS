import cron, { type ScheduledTask } from 'node-cron';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import { repo } from '../db/repository.js';
import { rawSqlite } from '../db/index.js';
import { nanoid } from 'nanoid';
import { logger } from '../services/logger.js';

export class Scheduler {
  private tasks = new Map<string, ScheduledTask>();
  private log = logger.child('scheduler');
  constructor(private browser: BrowserKernel) {}
  reload() { for (const t of this.tasks.values()) t.stop(); this.tasks.clear(); for (const job of repo.listJobs()) if (job.enabled && cron.validate(job.cron)) this.tasks.set(job.id, cron.schedule(job.cron, () => void this.run(job.id))); }
  async run(id: string) {
    const job = repo.listJobs().find(j=>j.id===id); if (!job) return;
    const runId=nanoid(); const started=Date.now(); rawSqlite().prepare('INSERT INTO job_runs(id,job_id,status,started_at) VALUES(?,?,?,?)').run(runId,id,'running',started);
    this.log.info('Job started', { jobId: id, runId, workflowType: job.workflowType });
    try {
      let output: unknown = { ok:true };
      if (job.workflowType === 'browser.navigate') { const url=String(job.payload.url ?? 'https://www.google.com'); await this.browser.navigate(url); output={navigated:url}; }
      else if (job.workflowType === 'demo') output={message:'demo workflow executed'};
      else throw new Error(`Unsupported workflowType: ${job.workflowType}`);
      rawSqlite().prepare('UPDATE job_runs SET status=?,finished_at=?,output_json=? WHERE id=?').run('success',Date.now(),JSON.stringify(output),runId); repo.markJobRun(id);
      this.log.info('Job completed', { id, runId, output });
    } catch(e) { rawSqlite().prepare('UPDATE job_runs SET status=?,finished_at=?,error=? WHERE id=?').run('failed',Date.now(),String(e),runId); this.log.error('Job failed',{id,runId,error:String(e)}); }
  }
}
