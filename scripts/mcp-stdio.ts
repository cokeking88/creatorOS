/**
 * External stdio MCP bridge — thin shell (agent-capabilities §13.4 D5).
 * All server construction lives in src/main/mcp/bridgeServer.ts (single-sourced
 * tool definitions); this script only reads env and injects the gateway fetch
 * adapter so `npm run mcp` / `npm run mcp:built` keep working unchanged.
 */
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { buildBridgeServer } from '../src/main/mcp/bridgeServer.js';

try { process.loadEnvFile?.('.env'); } catch {}

const base = process.env.CREATOROS_GATEWAY_URL ?? 'http://127.0.0.1:17890';
const token = process.env.CREATOROS_GATEWAY_TOKEN ?? 'change-me';
async function api(path: string, init?: RequestInit) {
  const r = await fetch(base + path, { ...init, headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token}`, ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

serveStdio(() => buildBridgeServer(api));
console.error('CreatorOS MCP bridge running on stdio');
