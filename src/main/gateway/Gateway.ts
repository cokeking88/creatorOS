import Fastify from 'fastify';
import cron from 'node-cron';
import type { BrowserWindow } from 'electron';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import type { Scheduler } from '../scheduler/Scheduler.js';
import { repo } from '../db/repository.js';
import { logger } from '../services/logger.js';

export async function startGateway(browser: BrowserKernel, scheduler: Scheduler, mainWindow?: () => BrowserWindow | null) {
  const log = logger.child('gateway');
  const app = Fastify({ logger:false });
  const token=process.env.CREATOROS_GATEWAY_TOKEN ?? 'change-me';
  /** Reject with a real HTTP 400 (reply400 alone only shaped the JSON body). */
  const badRequest = (reply: { code: (s: number) => { send: (b: unknown) => unknown } }, msg: string) => reply.code(400).send({ error: msg });
  app.addHook('onRequest', async (req, reply) => {
    log.debug('request', { method: req.method, url: req.url });
    if (req.url === '/health') return;
    if (req.headers.authorization !== `Bearer ${token}`) return reply.code(401).send({error:'unauthorized'});
  });
  app.get('/health', async()=>({ok:true}));
  app.get('/api/state', async()=>({profiles:repo.listProfiles(),contents:repo.listContents(),jobs:repo.listJobs(),tabs:browser.tabs.list(),activeProfileId:browser.activeProfile,activeTabId:browser.activeTab}));
  app.get('/api/browser/profiles', async()=>browser.profiles.list());
  app.get('/api/browser/tabs', async(req)=>browser.tabs.list((req.query as any)?.profileId));
  app.post('/api/browser/tabs', async(req)=>{const b=req.body as any;const t=browser.createTab(b?.profileId,b?.url);return {id:t.id,profileId:t.profileId,url:t.url};});
  app.post('/api/browser/tabs/:id/activate', async(req)=>{browser.activateTab((req.params as any).id);return {ok:true};});
  app.post('/api/browser/navigate', async(req)=>{await browser.navigate(String((req.body as any)?.url??''));return {ok:true};});
  app.post('/api/browser/back', async()=>{browser.back();return {ok:true};});
  app.post('/api/browser/forward', async()=>{browser.forward();return {ok:true};});
  app.post('/api/browser/reload', async()=>{browser.reload();return {ok:true};});
  app.get('/api/browser/snapshot', async()=>browser.snapshot());
  app.post('/api/browser/click', async(req)=>{await browser.click(String((req.body as any)?.ref??''));return {ok:true};});
  app.post('/api/browser/fill', async(req)=>{const b=req.body as any;await browser.fill(String(b?.ref??''),String(b?.value??''));return {ok:true};});
  app.post('/api/browser/scroll', async(req)=>{const b=req.body as any;await browser.scroll(Number(b?.dx??0),Number(b?.dy??600));return {ok:true};});
  app.post('/api/browser/evaluate', async(req)=>({result:await browser.evaluate(String((req.body as any)?.expression??''))}));
  app.post('/api/browser/upload', async(req)=>{const b=req.body as any;return browser.upload(String(b?.ref??''),Array.isArray(b?.paths)?b.paths.map(String):[]);});
  app.get('/api/browser/screenshot', async()=>({dataUrl:await browser.screenshot()}));
  // Main window (app UI) capture — used by the README/docs screenshots and the UI visual-review flow.
  app.get('/api/app/screenshot', async(_req, reply)=>{
    const win = mainWindow?.();
    if (!win || win.isDestroyed()) return reply.code(503).send({ error: 'main window not available' });
    const image = await win.webContents.capturePage();
    return { dataUrl: image.toDataURL() };
  });
  app.post('/api/jobs/:id/run', async(req)=>{await scheduler.run((req.params as any).id);return {ok:true};});
  app.get('/api/logs', async(req)=>{const q=(req.query as any);return {entries:logger.query({level:q?.level,module:q?.module,search:q?.search,since:q?.since?Number(q.since):undefined,limit:q?.limit?Number(q.limit):undefined}),modules:logger.modules()};});
  app.post('/api/logs/clear', async()=>{logger.clear();return {ok:true};});
  app.post('/api/jobs', async(req,reply)=>{
    const b=req.body as {name?:unknown;cron?:unknown;workflowType?:unknown;payload?:Record<string,unknown>|null};
    // Input validation (backend backstop for the Automation form): a job with a
    // bad shape must never reach the scheduler. cron.validate re-checks on reload.
    if (typeof b?.name!=='string'||!b.name.trim()) return badRequest(reply,'name is required');
    if (typeof b?.cron!=='string'||!cron.validate(b.cron)) return badRequest(reply,'cron is invalid');
    const wf=typeof b?.workflowType==='string'?b.workflowType:'';
    if (!['browser.navigate','demo','agent.run'].includes(wf)) return badRequest(reply,'workflowType must be one of browser.navigate|demo|agent.run');
    if (wf==='agent.run'&&!(typeof b?.payload?.prompt==='string'&&b.payload.prompt.trim())) return badRequest(reply,'agent.run job requires payload.prompt');
    const j=scheduler.createJob({name:b.name,cron:b.cron,workflowType:wf,payload:b.payload??{}});reply.code(201);return j;
  });
  app.post('/webhooks/feishu', async(req)=>{
    const body=req.body as any;
    if (body?.type === 'url_verification') return { challenge: body.challenge };
    log.info('Feishu webhook received', { eventType: body?.header?.event_type });
    return { code:0, msg:'ok', note:'Skeleton only. Add signature verification and command routing for production.' };
  });
  const host=process.env.CREATOROS_GATEWAY_HOST ?? '127.0.0.1';
  const port=Number(process.env.CREATOROS_GATEWAY_PORT ?? 17890);
  await app.listen({host,port}); log.info('Gateway listening',{host,port}); return app;
}
