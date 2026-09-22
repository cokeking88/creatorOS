import { describe, expect, it } from 'vitest';
import { buildBridgeServer } from '../src/main/mcp/bridgeServer.js';
import { APP_TOOL_DEFS } from '../src/main/agent/appToolDefs.js';

/**
 * AC-S8 (agent-capabilities §13.4/§13.9): the external stdio bridge gains ONLY
 * the 4 read-only app tools, single-sourced from APP_TOOL_DEFS; write/high-impact
 * tools must NOT be registered. The injected fetch makes the HTTP forwarding
 * observable without a gateway. Descriptor-level assertions (McpServer's
 * internal _registeredTools registry) keep this offline — a full stdio
 * round-trip is covered by `npm run mcp` manual use.
 */

type RegisteredTool = { description?: string; inputSchema?: unknown; executor: (args: unknown, ctx: unknown) => Promise<unknown> };
type BridgeServer = { _registeredTools: Record<string, RegisteredTool> };

function registeredTools(server: ReturnType<typeof buildBridgeServer>): Record<string, RegisteredTool> {
  return (server as unknown as BridgeServer)._registeredTools;
}

/** A fetch fake that records paths and returns a canned JSON payload per path. */
function fakeApi(log: string[]) {
  return async (path: string) => { log.push(path); return { via: path }; };
}

describe('bridge tool surface (D5: read-only quartet only)', () => {
  it('registers exactly the 15 browser tools + job_run + the 4 read-only app tools', () => {
    const tools = registeredTools(buildBridgeServer(async () => ({})));
    const names = Object.keys(tools).sort();
    expect(names.filter((n) => n.startsWith('browser_')).length).toBe(15);
    expect(names).toContain('job_run');
    expect(names).toContain('job_list');
    expect(names).toContain('content_list');
    expect(names).toContain('account_list');
    expect(names).toContain('skill_list');
    expect(names.length).toBe(20);
  });

  it('does NOT register any write/high-impact app tool (job_delete, *_create, *_update)', () => {
    const tools = registeredTools(buildBridgeServer(async () => ({})));
    const names = new Set(Object.keys(tools));
    for (const def of APP_TOOL_DEFS) {
      if (def.readOnly) continue;
      expect(names.has(def.name), `bridge must not register ${def.name}`).toBe(false);
    }
  });

  it('read-only quartet mirrors APP_TOOL_DEFS names and descriptions verbatim', () => {
    const tools = registeredTools(buildBridgeServer(async () => ({})));
    for (const def of APP_TOOL_DEFS) {
      if (!def.readOnly) continue;
      const t = tools[def.name];
      expect(t, def.name).toBeTruthy();
      expect(t.description).toBe(def.description);
    }
  });

  it('exactly 4 app tools are registered — the readOnly+httpPath set of APP_TOOL_DEFS', () => {
    const tools = registeredTools(buildBridgeServer(async () => ({})));
    const appDefs = APP_TOOL_DEFS.filter((d) => d.readOnly && d.httpPath);
    expect(appDefs.length).toBe(4);
    expect(Object.keys(tools).filter((n) => !n.startsWith('browser_') && n !== 'job_run').sort())
      .toEqual(appDefs.map((d) => d.name).sort());
  });
});

describe('bridge HTTP forwarding (injected fetch)', () => {
  it('job_list forwards to GET /api/jobs', async () => {
    const log: string[] = [];
    const s = buildBridgeServer(fakeApi(log));
    const res = await registeredTools(s).job_list.executor({}, {});
    expect(log).toEqual(['/api/jobs']);
    const payload = JSON.parse((res as { content: Array<{ text: string }> }).content[0].text);
    expect(payload).toEqual({ via: '/api/jobs' });
  });

  it('content_list maps platform/status args onto the /api/contents query string', async () => {
    const log: string[] = [];
    const s = buildBridgeServer(fakeApi(log));
    await registeredTools(s).content_list.executor({ platform: 'xiaohongshu', status: 'draft' }, {});
    expect(log[0].startsWith('/api/contents?')).toBe(true);
    expect(log[0]).toContain('platform=xiaohongshu');
    expect(log[0]).toContain('status=draft');
  });

  it('account_list and skill_list hit their GET endpoints', async () => {
    const log: string[] = [];
    const s = buildBridgeServer(fakeApi(log));
    const tools = registeredTools(s);
    await tools.account_list.executor({}, {});
    await tools.skill_list.executor({}, {});
    expect(log).toEqual(['/api/accounts', '/api/skills']);
  });
});
