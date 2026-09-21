import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

try { process.loadEnvFile?.('.env'); } catch {}

const base = process.env.CREATOROS_GATEWAY_URL ?? 'http://127.0.0.1:17890';
const token = process.env.CREATOROS_GATEWAY_TOKEN ?? 'change-me';
async function api(path:string, init?:RequestInit){const r=await fetch(base+path,{...init,headers:{'content-type':'application/json','authorization':`Bearer ${token}`,...(init?.headers??{})}});if(!r.ok)throw new Error(`${r.status} ${await r.text()}`);return r.json();}
function out(x:unknown){return {content:[{type:'text' as const,text:JSON.stringify(x,null,2)}]};}
function post(path:string, body:unknown={}){return api(path,{method:'POST',body:JSON.stringify(body)});}

function createServer(){
  const s=new McpServer({name:'creatoros-browser',version:'0.1.0'},{instructions:'Operate only the already-running CreatorOS embedded browser. Never launch external Chrome. Call browser_snapshot before browser_click/browser_fill to obtain fresh element refs.'});
  s.registerTool('browser_list_profiles',{description:'List persistent CreatorOS browser profiles'},async()=>out(await api('/api/browser/profiles')));
  s.registerTool('browser_list_tabs',{description:'List tabs',inputSchema:z.object({profileId:z.string().optional()})},async({profileId})=>out(await api('/api/browser/tabs'+(profileId?`?profileId=${encodeURIComponent(profileId)}`:''))));
  s.registerTool('browser_open_tab',{description:'Open a tab in an internal persistent browser profile',inputSchema:z.object({profileId:z.string().optional(),url:z.string().optional()})},async(x)=>out(await post('/api/browser/tabs',x)));
  s.registerTool('browser_switch_tab',{description:'Switch the visible internal tab',inputSchema:z.object({tabId:z.string()})},async({tabId})=>out(await post(`/api/browser/tabs/${encodeURIComponent(tabId)}/activate`)));
  s.registerTool('browser_navigate',{description:'Navigate active embedded tab',inputSchema:z.object({url:z.string().min(1)})},async(x)=>out(await post('/api/browser/navigate',x)));
  s.registerTool('browser_back',{description:'Go back'},async()=>out(await post('/api/browser/back')));
  s.registerTool('browser_forward',{description:'Go forward'},async()=>out(await post('/api/browser/forward')));
  s.registerTool('browser_reload',{description:'Reload active page'},async()=>out(await post('/api/browser/reload')));
  s.registerTool('browser_snapshot',{description:'Read visible page text and assign stable-for-this-snapshot refs to interactive elements'},async()=>out(await api('/api/browser/snapshot')));
  s.registerTool('browser_click',{description:'Click an element ref from the latest snapshot',inputSchema:z.object({ref:z.string()})},async(x)=>out(await post('/api/browser/click',x)));
  s.registerTool('browser_fill',{description:'Fill an element ref from the latest snapshot',inputSchema:z.object({ref:z.string(),value:z.string()})},async(x)=>out(await post('/api/browser/fill',x)));
  s.registerTool('browser_scroll',{description:'Scroll page',inputSchema:z.object({dx:z.number().optional(),dy:z.number().optional()})},async(x)=>out(await post('/api/browser/scroll',x)));
  s.registerTool('browser_evaluate',{description:'Evaluate JavaScript in active embedded page. Use only when semantic tools are insufficient.',inputSchema:z.object({expression:z.string()})},async(x)=>out(await post('/api/browser/evaluate',x)));
  s.registerTool('browser_upload',{description:'Upload local files to a file input ref from the latest snapshot',inputSchema:z.object({ref:z.string(),paths:z.array(z.string()).min(1)})},async(x)=>out(await post('/api/browser/upload',x)));
  s.registerTool('browser_screenshot',{description:'Capture active embedded page as a data URL'},async()=>out(await api('/api/browser/screenshot')));
  s.registerTool('job_run',{description:'Run a persisted CreatorOS automation job now',inputSchema:z.object({jobId:z.string()})},async({jobId})=>out(await post(`/api/jobs/${encodeURIComponent(jobId)}/run`)));
  return s;
}
void serveStdio(createServer);
console.error('CreatorOS MCP bridge running on stdio');
