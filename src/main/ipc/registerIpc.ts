import { ipcMain, type BrowserWindow } from 'electron';
import { IPC } from '../../shared/ipc.js';
import type { LogFilter, ProviderConfig } from '../../shared/types.js';
import type { BrowserKernel } from '../browser/BrowserKernel.js';
import type { Scheduler } from '../scheduler/Scheduler.js';
import type { AgentRuntime } from '../agent/AgentRuntime.js';
import { repo } from '../db/repository.js';
import { logger } from '../services/logger.js';
import { getProviderConfig, setProviderConfig, testProviderConnection } from '../services/settings.js';

export function registerIpc(win: BrowserWindow, browser: BrowserKernel, scheduler: Scheduler, agent: AgentRuntime) {
  const state=()=>({platforms:repo.listPlatforms(),accounts:repo.listAccounts(),profiles:repo.listProfiles(),tabs:browser.tabs.list(),contents:repo.listContents(),jobs:repo.listJobs(),activeProfileId:browser.activeProfile,activeTabId:browser.activeTab});
  const changed=()=>win.webContents.send(IPC.EVENT_STATE_CHANGED);
  ipcMain.handle(IPC.APP_STATE,()=>state());
  ipcMain.handle(IPC.ACCOUNT_CREATE,(_e,input)=>{const a=repo.createAccount(input);changed();return a;});
  ipcMain.handle(IPC.PROFILE_CREATE,(_e,input)=>{const p=browser.profiles.create(input);browser.activateProfile(p.id);changed();return p;});
  ipcMain.handle(IPC.PROFILE_ACTIVATE,(_e,id)=>{browser.activateProfile(id);changed();});
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
  ipcMain.handle(IPC.JOB_CREATE,(_e,input)=>{const x=repo.createJob(input);scheduler.reload();changed();return x;});
  ipcMain.handle(IPC.JOB_TOGGLE,(_e,id,enabled)=>{repo.toggleJob(id,enabled);scheduler.reload();changed();});
  ipcMain.handle(IPC.AGENT_CHAT,(_e,messages)=>agent.chat(messages));
  ipcMain.handle(IPC.LOGS_LIST,(_e,filter:LogFilter)=>({entries:logger.query(filter ?? {}),modules:logger.modules()}));
  ipcMain.handle(IPC.LOGS_CLEAR,()=>{logger.clear();});
  ipcMain.handle(IPC.SETTINGS_GET,()=>getProviderConfig());
  ipcMain.handle(IPC.SETTINGS_SET,(_e,cfg:ProviderConfig)=>{setProviderConfig(cfg);changed();return getProviderConfig();});
  ipcMain.handle(IPC.SETTINGS_TEST_PROVIDER,()=>testProviderConnection());
}
