import type { AppState, BrowserSnapshot, LogEntry, LogFilter, ProviderConfig, ProviderTestResult } from '../shared/types';
declare global { interface Window { creatorOS: {
  state:()=>Promise<AppState>;
  account:{create:(x:any)=>Promise<any>};
  profile:{create:(x:any)=>Promise<any>;activate:(id:string)=>Promise<void>};
  tab:{create:(p?:string,u?:string)=>Promise<string>;activate:(id:string)=>Promise<void>;close:(id:string)=>Promise<void>};
  browser:{navigate:(u:string)=>Promise<void>;back:()=>Promise<void>;forward:()=>Promise<void>;reload:()=>Promise<void>;layout:(b:{x:number;y:number;width:number;height:number},v:boolean)=>Promise<void>;snapshot:()=>Promise<BrowserSnapshot>};
  content:{list:()=>Promise<any[]>;create:(x:any)=>Promise<any>;update:(id:string,x:any)=>Promise<void>};
  jobs:{list:()=>Promise<any[]>;create:(x:any)=>Promise<any>;toggle:(id:string,e:boolean)=>Promise<void>};
  agent:{chat:(m:any[])=>Promise<{text:string;provider:string}>};
  logs:{list:(f?:LogFilter)=>Promise<{entries:LogEntry[];modules:string[]}>;clear:()=>Promise<void>};
  settings:{get:()=>Promise<ProviderConfig>;set:(x:ProviderConfig)=>Promise<ProviderConfig>;testProvider:()=>Promise<ProviderTestResult>};
  onStateChanged:(cb:()=>void)=>()=>void;
}; } }
export {};