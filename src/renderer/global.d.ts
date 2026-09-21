import type { AppState, BrowserSnapshot, LogEntry, LogFilter, AgentEngineConfig, AgentStep, AgentRunResult } from '../shared/types';
declare global { interface Window { creatorOS: {
  state:()=>Promise<AppState>;
  account:{create:(x:any)=>Promise<any>};
  profile:{create:(x:any)=>Promise<any>;activate:(id:string)=>Promise<void>};
  tab:{create:(p?:string,u?:string)=>Promise<string>;activate:(id:string)=>Promise<void>;close:(id:string)=>Promise<void>};
  browser:{navigate:(u:string)=>Promise<void>;back:()=>Promise<void>;forward:()=>Promise<void>;reload:()=>Promise<void>;layout:(b:{x:number;y:number;width:number;height:number},v:boolean)=>Promise<void>;snapshot:()=>Promise<BrowserSnapshot>};
  content:{list:()=>Promise<any[]>;create:(x:any)=>Promise<any>;update:(id:string,x:any)=>Promise<void>};
  jobs:{list:()=>Promise<any[]>;create:(x:any)=>Promise<any>;toggle:(id:string,e:boolean)=>Promise<void>};
  agent:{run:(prompt:string,resumeSessionId?:string)=>Promise<{runId:string}>;stop:(runId:string)=>Promise<boolean>};
  logs:{list:(f?:LogFilter)=>Promise<{entries:LogEntry[];modules:string[]}>;clear:()=>Promise<void>};
  settings:{get:()=>Promise<AgentEngineConfig>;set:(x:AgentEngineConfig)=>Promise<AgentEngineConfig>;testProvider:()=>Promise<{ok:boolean;detail:string}>};
  onStateChanged:(cb:()=>void)=>()=>void;
  onAgentStep:(cb:(s:AgentStep)=>void)=>()=>void;
  onAgentDone:(cb:(r:AgentRunResult)=>void)=>()=>void;
}; } }
export {};