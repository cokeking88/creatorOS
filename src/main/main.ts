import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, rawSqlite } from './db/index.js';
import { SkillsRepo } from './db/skillsRepo.js';
import { BrowserKernel } from './browser/BrowserKernel.js';
import { bindUaSource } from './browser/ProfileManager.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { initClaudeAgent } from './agent/claudeAgent.js';
import { createAppTools } from './agent/appTools.js';
import { createStepBus } from './agent/stepBus.js';
import { registerIpc } from './ipc/registerIpc.js';
import { startGateway } from './gateway/Gateway.js';
import { repo } from './db/repository.js';
import { logger } from './services/logger.js';
import { IPC } from '../shared/ipc.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile?.(join(process.cwd(), '.env')); } catch { /* .env optional */ }
// Embedded-browser normality (SECURITY.md #11 scope: presentation hygiene, not
// spoofing): strip Chromium's automation marks so pages behave exactly as they
// do in any embedded-browser product (VS Code webviews, Slack browser views).
// Without this, navigator.webdriver === true and Google sign-in (among others)
// rejects the session outright.
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Test isolation: point userData at a throwaway dir instead of the real profile directory.
if (process.env.CREATOROS_USER_DATA) app.setPath('userData', process.env.CREATOROS_USER_DATA);
logger.init(join(app.getPath('userData'), 'logs'));
const log = logger.child('app');
let mainWindow: BrowserWindow | null = null;
let kernel: BrowserKernel | null = null;

// One bus for the whole app: agent runs publish steps/done here, subscribers
// forward to whichever window is alive. Subscribing once at startup means a
// rebuilt window automatically resumes receiving events (arch spec §2.1).
const agentBus = createStepBus();
agentBus.subscribe((ev) => {
  const w = mainWindow; // always the current reference — never a captured stale window
  if (!w || w.isDestroyed()) return; // event dropped; audit trail is agent_runs + logs
  if (ev.kind === 'step') w.webContents.send(IPC.EVENT_AGENT_STEP, ev.step);
  else w.webContents.send(IPC.EVENT_AGENT_DONE, ev.result);
});

async function createWindow() {
  mainWindow = new BrowserWindow({ width:1440,height:900,minWidth:1100,minHeight:700,title:'CreatorOS',backgroundColor:'#0f1115',webPreferences:{preload:join(__dirname,'../preload/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true} });
  bindUaSource(mainWindow.webContents);
  const changed=()=>mainWindow?.webContents.send('event:state-changed');
  kernel = new BrowserKernel(mainWindow, changed); initDatabase(); kernel.bootstrap();
  const skills = new SkillsRepo(rawSqlite());
  const agent = initClaudeAgent(kernel, { bus: agentBus });
  const scheduler=new Scheduler(kernel, agent, skills); scheduler.reload();
  // Break the agent<->scheduler cycle (§13.3): appTools needs the scheduler, the
  // scheduler needs the agent — wire the tool face after both exist, before any
  // window load. Broadcast = the same EVENT_STATE_CHANGED every IPC write sends.
  agent.setAppTools(createAppTools({ repo, scheduler, skills, onChange: changed }));
  registerIpc(mainWindow,kernel,scheduler,agent,skills);
  void startGateway(kernel,scheduler,skills,()=>mainWindow).catch(e=>log.error('Gateway start failed',String(e)));
  const dev=process.env.VITE_DEV_SERVER_URL; if(dev) await mainWindow.loadURL(dev); else await mainWindow.loadFile(join(__dirname,'../../dist/index.html'));
  mainWindow.on('closed',()=>{mainWindow=null;kernel=null;});
  log.info('App window ready', { dev: Boolean(dev) });
}

app.whenReady().then(createWindow).catch(e=>{log.error('Fatal startup',String(e));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();});
