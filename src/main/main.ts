import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase } from './db/index.js';
import { BrowserKernel } from './browser/BrowserKernel.js';
import { Scheduler } from './scheduler/Scheduler.js';
import { AgentRuntime } from './agent/AgentRuntime.js';
import { registerIpc } from './ipc/registerIpc.js';
import { startGateway } from './gateway/Gateway.js';
import { logger } from './services/logger.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
try { process.loadEnvFile?.(join(process.cwd(), '.env')); } catch { /* .env optional */ }
// Test isolation: point userData at a throwaway dir instead of the real profile directory.
if (process.env.CREATOROS_USER_DATA) app.setPath('userData', process.env.CREATOROS_USER_DATA);
logger.init(join(app.getPath('userData'), 'logs'));
const log = logger.child('app');
let mainWindow: BrowserWindow | null = null;
let kernel: BrowserKernel | null = null;

async function createWindow() {
  mainWindow = new BrowserWindow({ width:1440,height:900,minWidth:1100,minHeight:700,title:'CreatorOS',backgroundColor:'#0f1115',webPreferences:{preload:join(__dirname,'../preload/preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true} });
  const changed=()=>mainWindow?.webContents.send('event:state-changed');
  kernel = new BrowserKernel(mainWindow, changed); initDatabase(); kernel.bootstrap();
  const scheduler=new Scheduler(kernel); scheduler.reload(); const agent=new AgentRuntime(kernel); registerIpc(mainWindow,kernel,scheduler,agent);
  void startGateway(kernel,scheduler).catch(e=>log.error('Gateway start failed',String(e)));
  const dev=process.env.VITE_DEV_SERVER_URL; if(dev) await mainWindow.loadURL(dev); else await mainWindow.loadFile(join(__dirname,'../../dist/index.html'));
  mainWindow.on('closed',()=>{mainWindow=null;kernel=null;});
  log.info('App window ready', { dev: Boolean(dev) });
}

app.whenReady().then(createWindow).catch(e=>{log.error('Fatal startup',String(e));app.quit();});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)void createWindow();});