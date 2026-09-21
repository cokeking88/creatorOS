const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

const IPC = {
  APP_STATE: 'app:state', ACCOUNT_CREATE: 'account:create', PROFILE_CREATE: 'profile:create', PROFILE_ACTIVATE: 'profile:activate',
  TAB_CREATE: 'tab:create', TAB_ACTIVATE: 'tab:activate', TAB_CLOSE: 'tab:close',
  BROWSER_NAVIGATE: 'browser:navigate', BROWSER_BACK: 'browser:back', BROWSER_FORWARD: 'browser:forward',
  BROWSER_RELOAD: 'browser:reload', BROWSER_LAYOUT: 'browser:layout', BROWSER_SNAPSHOT: 'browser:snapshot',
  CONTENT_LIST: 'content:list', CONTENT_CREATE: 'content:create', CONTENT_UPDATE: 'content:update',
  JOB_LIST: 'job:list', JOB_CREATE: 'job:create', JOB_TOGGLE: 'job:toggle',
  LOGS_LIST: 'logs:list', LOGS_CLEAR: 'logs:clear',
  SETTINGS_GET: 'settings:get', SETTINGS_SET: 'settings:set', SETTINGS_TEST_PROVIDER: 'settings:test-provider',
  AGENT_RUN: 'agent:run', AGENT_STOP: 'agent:stop',
  EVENT_STATE_CHANGED: 'event:state-changed',
  EVENT_AGENT_STEP: 'event:agent-step',
  EVENT_AGENT_DONE: 'event:agent-done'
} as const;

const invoke = <T = unknown,>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;
contextBridge.exposeInMainWorld('creatorOS', {
  state:()=>invoke(IPC.APP_STATE),
  account:{create:(x:unknown)=>invoke(IPC.ACCOUNT_CREATE,x)},
  profile:{create:(x:unknown)=>invoke(IPC.PROFILE_CREATE,x),activate:(id:string)=>invoke(IPC.PROFILE_ACTIVATE,id)},
  tab:{create:(p?:string,u?:string)=>invoke(IPC.TAB_CREATE,p,u),activate:(id:string)=>invoke(IPC.TAB_ACTIVATE,id),close:(id:string)=>invoke(IPC.TAB_CLOSE,id)},
  browser:{navigate:(u:string)=>invoke(IPC.BROWSER_NAVIGATE,u),back:()=>invoke(IPC.BROWSER_BACK),forward:()=>invoke(IPC.BROWSER_FORWARD),reload:()=>invoke(IPC.BROWSER_RELOAD),layout:(b:unknown,v:boolean)=>invoke(IPC.BROWSER_LAYOUT,b,v),snapshot:()=>invoke(IPC.BROWSER_SNAPSHOT)},
  content:{list:()=>invoke(IPC.CONTENT_LIST),create:(x:unknown)=>invoke(IPC.CONTENT_CREATE,x),update:(id:string,x:unknown)=>invoke(IPC.CONTENT_UPDATE,id,x)},
  jobs:{list:()=>invoke(IPC.JOB_LIST),create:(x:unknown)=>invoke(IPC.JOB_CREATE,x),toggle:(id:string,e:boolean)=>invoke(IPC.JOB_TOGGLE,id,e)},
  agent:{run:(p:string,resume?:string)=>invoke<{runId:string}>(IPC.AGENT_RUN,p,resume),stop:(runId:string)=>invoke<boolean>(IPC.AGENT_STOP,runId)},
  logs:{list:(f?:unknown)=>invoke(IPC.LOGS_LIST,f),clear:()=>invoke(IPC.LOGS_CLEAR)},
  settings:{get:()=>invoke(IPC.SETTINGS_GET),set:(x:unknown)=>invoke(IPC.SETTINGS_SET,x),testProvider:()=>invoke(IPC.SETTINGS_TEST_PROVIDER)},
  onStateChanged:(cb:()=>void)=>{const fn=()=>cb();ipcRenderer.on(IPC.EVENT_STATE_CHANGED,fn);return()=>ipcRenderer.removeListener(IPC.EVENT_STATE_CHANGED,fn);},
  onAgentStep:(cb:(s:unknown)=>void)=>{const fn=(_e:any,s:unknown)=>cb(s);ipcRenderer.on(IPC.EVENT_AGENT_STEP,fn);return()=>ipcRenderer.removeListener(IPC.EVENT_AGENT_STEP,fn);},
  onAgentDone:(cb:(r:unknown)=>void)=>{const fn=(_e:any,r:unknown)=>cb(r);ipcRenderer.on(IPC.EVENT_AGENT_DONE,fn);return()=>ipcRenderer.removeListener(IPC.EVENT_AGENT_DONE,fn);}
});