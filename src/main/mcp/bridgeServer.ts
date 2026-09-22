/**
 * External stdio MCP bridge — shared host (agent-capabilities §13.4 D5).
 *
 * The server construction moved here from scripts/mcp-stdio.ts so the tool
 * surface can single-source its read-only quartet from APP_TOOL_DEFS (the same
 * definitions the in-process SDK host and vitest consume — name/description/
 * schema drift is structurally impossible). `fetchImpl` is injected: the thin
 * script shell passes a gateway-URL adapter, tests pass a fake — the HTTP
 * forwarding is observable without spawning a server.
 *
 * Boundary (D5 final): the bridge keeps the 15 browser tools + job_run (HTTP
 * forwarders, unchanged semantics) and gains ONLY the 4 read-only app tools;
 * write/high-impact tools are deliberately NOT registered here — any external
 * process holding the gateway token can read operations state but cannot
 * mutate the unattended execution surface. Server name stays
 * `creatoros-browser`: the name IS the boundary declaration.
 */
import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { APP_TOOL_DEFS } from '../agent/appToolDefs.js';

/** What the thin shell injects: path+init in, parsed JSON out (non-2xx throws). */
export type BridgeApi = (path: string, init?: RequestInit) => Promise<unknown>;

function out(x: unknown) { return { content: [{ type: 'text' as const, text: JSON.stringify(x, null, 2) }] }; }
const post = (api: BridgeApi) => (path: string, body: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(body) });

export function buildBridgeServer(api: BridgeApi): McpServer {
  const send = post(api);
  const s = new McpServer({ name: 'creatoros-browser', version: '0.1.0' }, { instructions: 'Operate only the already-running CreatorOS embedded browser. Never launch external Chrome. Call browser_snapshot before browser_click/browser_fill to obtain fresh element refs.' });
  // 15 browser tools — HTTP forwarders, semantics unchanged from the v0.3 bridge.
  s.registerTool('browser_list_profiles', { description: 'List persistent CreatorOS browser profiles' }, async () => out(await api('/api/browser/profiles')));
  s.registerTool('browser_list_tabs', { description: 'List tabs', inputSchema: z.object({ profileId: z.string().optional() }) }, async ({ profileId }) => out(await api('/api/browser/tabs' + (profileId ? `?profileId=${encodeURIComponent(profileId)}` : ''))));
  s.registerTool('browser_open_tab', { description: 'Open a tab in an internal persistent browser profile', inputSchema: z.object({ profileId: z.string().optional(), url: z.string().optional() }) }, async (x) => out(await send('/api/browser/tabs', x)));
  s.registerTool('browser_switch_tab', { description: 'Switch the visible internal tab', inputSchema: z.object({ tabId: z.string() }) }, async ({ tabId }) => out(await send(`/api/browser/tabs/${encodeURIComponent(tabId)}/activate`)));
  s.registerTool('browser_navigate', { description: 'Navigate active embedded tab', inputSchema: z.object({ url: z.string().min(1) }) }, async (x) => out(await send('/api/browser/navigate', x)));
  s.registerTool('browser_back', { description: 'Go back' }, async () => out(await send('/api/browser/back')));
  s.registerTool('browser_forward', { description: 'Go forward' }, async () => out(await send('/api/browser/forward')));
  s.registerTool('browser_reload', { description: 'Reload active page' }, async () => out(await send('/api/browser/reload')));
  s.registerTool('browser_snapshot', { description: 'Read visible page text and assign stable-for-this-snapshot refs to interactive elements' }, async () => out(await api('/api/browser/snapshot')));
  s.registerTool('browser_click', { description: 'Click an element ref from the latest snapshot', inputSchema: z.object({ ref: z.string() }) }, async (x) => out(await send('/api/browser/click', x)));
  s.registerTool('browser_fill', { description: 'Fill an element ref from the latest snapshot', inputSchema: z.object({ ref: z.string(), value: z.string() }) }, async (x) => out(await send('/api/browser/fill', x)));
  s.registerTool('browser_scroll', { description: 'Scroll page', inputSchema: z.object({ dx: z.number().optional(), dy: z.number().optional() }) }, async (x) => out(await send('/api/browser/scroll', x)));
  s.registerTool('browser_evaluate', { description: 'Evaluate JavaScript in active embedded page. Use only when semantic tools are insufficient.', inputSchema: z.object({ expression: z.string() }) }, async (x) => out(await send('/api/browser/evaluate', x)));
  s.registerTool('browser_upload', { description: 'Upload local files to a file input ref from the latest snapshot', inputSchema: z.object({ ref: z.string(), paths: z.array(z.string()).min(1) }) }, async (x) => out(await send('/api/browser/upload', x)));
  s.registerTool('browser_screenshot', { description: 'Capture active embedded page as a data URL' }, async () => out(await api('/api/browser/screenshot')));
  s.registerTool('job_run', { description: 'Run a persisted CreatorOS automation job now', inputSchema: z.object({ jobId: z.string() }) }, async ({ jobId }) => out(await send(`/api/jobs/${encodeURIComponent(jobId)}/run`)));
  // Read-only quartet (D5): single-sourced from APP_TOOL_DEFS — the shape feeds
  // registerTool wrapped as z.object (the modern StandardSchemaWithJSON overload;
  // the legacy raw-shape overload type-mismatches across zod import styles),
  // def.httpPath maps the args to the Gateway GET.
  for (const def of APP_TOOL_DEFS) {
    if (!def.readOnly || !def.httpPath) continue;
    s.registerTool(def.name, { description: def.description, inputSchema: z.object(def.shape) }, async (a: Record<string, unknown>) => out(await api(def.httpPath!(a))));
  }
  return s;
}
