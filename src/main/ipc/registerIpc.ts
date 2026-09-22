import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc.js';
import type { AgentEngineConfig, AgentRunSummary, JobRunSummary, LogFilter, SkillRecord } from '../../shared/types.js';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import type { Scheduler } from '../scheduler/Scheduler.js';
import type { SkillsRepo } from '../db/skillsRepo.js';
import { repo } from '../db/repository.js';
import { rawSqlite } from '../db/index.js';
import { logger } from '../services/logger.js';
import { getAgentEngineConfig, setAgentEngineConfig } from '../services/settings.js';
import { getClaudeAgent, type ClaudeAgentService } from '../agent/claudeAgent.js';
import { nanoid } from 'nanoid';
import { AccountFilesService, accountRoot, ensureAccountDir } from '../services/accountFiles.js';

const jobsLog = logger.child('jobs');

export function registerIpc(win: BrowserWindow, browser: BrowserKernel, scheduler: Scheduler, agent: ClaudeAgentService, skills: SkillsRepo) {
  const state=()=>({platforms:repo.listPlatforms(),accounts:repo.listAccounts(),profiles:repo.listProfiles(),tabs:browser.tabs.list(),contents:repo.listContents(),jobs:repo.listJobs(),skills:skills.list(),activeProfileId:browser.activeProfile,activeTabId:browser.activeTab});
  const changed=()=>win.webContents.send(IPC.EVENT_STATE_CHANGED);
  ipcMain.handle(IPC.APP_STATE,()=>state());
  ipcMain.handle(IPC.ACCOUNT_CREATE,(_e,input)=>{const a=repo.createAccount(input);changed();return a;});
  ipcMain.handle(IPC.PROFILE_CREATE,(_e,input)=>{const p=browser.profiles.create(input);browser.activateProfile(p.id);changed();return p;});
  ipcMain.handle(IPC.PROFILE_ACTIVATE,(_e,id)=>{browser.activateProfile(id);changed();});
  ipcMain.handle(IPC.PROFILE_RENAME,(_e,id:string,name:string)=>{repo.renameProfile(id,name);changed();});
  ipcMain.handle(IPC.TAB_CREATE,(_e,profileId,url)=>{const t=browser.createTab(profileId,url);changed();return t.id;});
  ipcMain.handle(IPC.TAB_ACTIVATE,(_e,id)=>{browser.activateTab(id);changed();});
  ipcMain.handle(IPC.TAB_CLOSE,(_e,id)=>{browser.closeTab(id);changed();});
  ipcMain.handle(IPC.BROWSER_NAVIGATE,async(_e,url)=>{await browser.navigate(url);changed();});
  ipcMain.handle(IPC.BROWSER_BACK,()=>browser.back()); ipcMain.handle(IPC.BROWSER_FORWARD,()=>browser.forward()); ipcMain.handle(IPC.BROWSER_RELOAD,()=>browser.reload());
  ipcMain.handle(IPC.BROWSER_LAYOUT,(_e,bounds,visible)=>{browser.setBounds(bounds); if (visible) browser.showActive(); else browser.hideAll();});
  ipcMain.handle(IPC.BROWSER_SNAPSHOT,()=>browser.snapshot());
  ipcMain.handle(IPC.CONTENT_LIST,()=>repo.listContents());
  ipcMain.handle(IPC.CONTENT_CREATE,(_e,input)=>{const x=repo.createContent(input);changed();return x;});
  ipcMain.handle(IPC.CONTENT_UPDATE,(_e,id,patch)=>{repo.updateContent(id,patch);changed();});
  ipcMain.handle(IPC.JOB_LIST,()=>repo.listJobs());
  // §13.8 route convergence: all three mutations go through Scheduler instance
  // methods (reload folded in) — no caller may call repo + reload on its own.
  ipcMain.handle(IPC.JOB_CREATE,(_e,input)=>{const x=scheduler.createJob(input);changed();return x;});
  ipcMain.handle(IPC.JOB_TOGGLE,(_e,id,enabled)=>{scheduler.toggleJob(id,enabled);changed();});
  ipcMain.handle(IPC.JOB_DELETE,(_e,id: string)=>{scheduler.deleteJob(id);changed();jobsLog.info('Job deleted',{jobId:id});});
  // Skills write channels (§13.7). SKILL_LIST is deliberately absent — the list
  // rides the app:state projection. origin is hardcoded 'manual' here: client
  // input never decides origin (the skill_create tool hardcodes 'agent').
  ipcMain.handle(IPC.SKILL_CREATE,(_e,input:{name:string;description?:string;promptTemplate:string})=>{const s=skills.create({...input,origin:'manual'});changed();return s;});
  ipcMain.handle(IPC.SKILL_UPDATE,(_e,id:string,patch:{name?:string;description?:string;promptTemplate?:string})=>{const s=skills.update(id,patch);changed();return s;});
  ipcMain.handle(IPC.SKILL_DELETE,(_e,id: string)=>{skills.delete(id);changed();});
  ipcMain.handle(IPC.LOGS_LIST,(_e,filter:LogFilter)=>({entries:logger.query(filter ?? {}),modules:logger.modules()}));
  ipcMain.handle(IPC.LOGS_CLEAR,()=>{logger.clear();});
  ipcMain.handle(IPC.SETTINGS_GET,()=>getAgentEngineConfig());
  ipcMain.handle(IPC.SETTINGS_SET,(_e,cfg:AgentEngineConfig)=>{setAgentEngineConfig(cfg);changed();return getAgentEngineConfig();});
  ipcMain.handle(IPC.SETTINGS_TEST_PROVIDER,()=>getClaudeAgent().testConnection());
  // agent:run returns {runId} immediately; every later state of the run (steps,
  // done) flows over the StepBus -> EVENT_AGENT_STEP/EVENT_AGENT_DONE events.
  ipcMain.handle(IPC.AGENT_RUN,(_e,prompt: string,resumeSessionId?: string)=>{
    const runId=nanoid();
    // Fire-and-forget: streamRun resolves (never rejects — run failures resolve
    // ok:false) and finalize() is the single place that publishes the done event.
    void agent.streamRun(prompt,{runId,source:'chat',resumeSessionId:resumeSessionId??null})
      .catch(e=>logger.child('agent').error('Agent stream failed unexpectedly',{runId,error:String(e)}));
    return {runId};
  });
  ipcMain.handle(IPC.AGENT_STOP,(_e,runId: string)=>agent.stop(runId));
  // Read-only dashboard projection (agent_runs + job_runs, §7.2). rawSqlite on
  // purpose: no repo precedent for these two tables and Scheduler already uses
  // raw prepare at this layer.
  type AgentRunRow = { id:string; status:string; input_json:string; cost_usd:number|null; duration_ms:number|null; started_at:number; finished_at:number|null };
  type JobRunRow = { id:string; job_id:string; job_name:string|null; status:string; started_at:number; finished_at:number|null; error:string|null };
  ipcMain.handle(IPC.AGENT_RUNS_LIST,(_e,limit=10)=>{
    const agentRuns=(rawSqlite().prepare(
      `SELECT id,status,input_json,cost_usd,duration_ms,started_at,finished_at FROM agent_runs ORDER BY started_at DESC LIMIT ?`
    ).all(limit) as AgentRunRow[]).map((r):AgentRunSummary=>{
      // input_json is written by claudeAgent as {prompt, source}; a corrupted row
      // must degrade, not take the whole dashboard down.
      let prompt=''; let source='chat';
      try { const input=JSON.parse(r.input_json) as {prompt?:unknown;source?:unknown}; if(typeof input.prompt==='string')prompt=input.prompt; if(typeof input.source==='string')source=input.source; } catch { /* corrupted input_json */ }
      return { id:r.id,status:r.status,source,prompt,ok:r.status==='success',costUsd:r.cost_usd,durationMs:r.duration_ms,startedAt:r.started_at,finishedAt:r.finished_at };
    });
    const jobRuns=(rawSqlite().prepare(
      `SELECT jr.id,jr.job_id,jr.status,jr.started_at,jr.finished_at,jr.error,j.name AS job_name FROM job_runs jr LEFT JOIN jobs j ON j.id=jr.job_id ORDER BY jr.started_at DESC LIMIT ?`
    ).all(limit) as JobRunRow[]).map((r):JobRunSummary=>({ id:r.id,jobId:r.job_id,jobName:r.job_name??'(已删除)',status:r.status,startedAt:r.started_at,finishedAt:r.finished_at,error:r.error }));
    return { agentRuns, jobRuns } satisfies { agentRuns:AgentRunSummary[]; jobRuns:JobRunSummary[] };
  });

  // --- Account files (fenced to <userData>/accounts/<accountId>) ---
  const filesLog = logger.child('files');
  let filesWatcher: import('chokidar').FSWatcher | null = null;
  let watchedAccount: string | null = null;
  const filesChanged = (accountId: string, relPath: string | null) => {
    if (!win.isDestroyed()) win.webContents.send(IPC.EVENT_FILES_CHANGED, { accountId, relPath });
  };
  const stopFilesWatcher = async () => { if (filesWatcher) { await filesWatcher.close(); filesWatcher = null; } watchedAccount = null; };
  const svc = (accountId: string) => new AccountFilesService(accountId);
  ipcMain.handle(IPC.FILES_READ, (_e, accountId: string, rel: string) => svc(accountId).read(rel));
  ipcMain.handle(IPC.FILES_WRITE, (_e, accountId: string, rel: string, content: string) => {
    const r = svc(accountId).write(rel, content);
    filesLog.info('File written', { accountId, rel });
    return r;
  });
  ipcMain.handle(IPC.FILES_MKDIR, (_e, accountId: string, rel: string) => { svc(accountId).mkdir(rel); return { ok: true }; });
  ipcMain.handle(IPC.FILES_RENAME, (_e, accountId: string, from: string, to: string) => { svc(accountId).rename(from, to); filesLog.info('File renamed', { accountId, from, to }); return { ok: true }; });
  ipcMain.handle(IPC.FILES_LIST, async (_e, accountId: string) => {
    // Watching happens on list (Files page open / account switch): single watcher per app.
    // The account dir also becomes the agent's cwd + file-tool fence for subsequent runs.
    agent.setAccountDir(ensureAccountDir(accountId));
    if (watchedAccount !== accountId) {
      await stopFilesWatcher();
      const { default: chokidar } = await import('chokidar');
      const root = accountRoot(accountId);
      watchedAccount = accountId;
      filesWatcher = chokidar.watch(root, {
        ignoreInitial: true,
        ignored: [/(^|[/\\])\.DS_Store$/, /(^|[/\\])\.git\//],
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 50 },
      });
      filesWatcher.on('all', (_ev: string, absPath: string) => {
        filesChanged(accountId, absPath.slice(root.length).replace(/^\//, '') || null);
      });
      filesLog.info('Watching account dir', { accountId });
    }
    return svc(accountId).list();
  });
  win.on('closed', () => { void stopFilesWatcher(); });
}
