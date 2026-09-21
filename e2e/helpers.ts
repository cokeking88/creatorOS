import { _electron as electron, expect, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export const GATEWAY_PORT = 17991;
export const GATEWAY_BASE = `http://127.0.0.1:${GATEWAY_PORT}`;
export const TOKEN = 'e2e-token';
const FIXTURE_URL = 'http://127.0.0.1:17992/';

export type Launched = { electronApp: ElectronApplication; window: Page; userData: string };

/** Launch the real app against a throwaway userData dir and test-only gateway port. */
export async function launchApp(userDataArg?: string): Promise<Launched> {
  const userData = userDataArg ?? mkdtempSync(join(tmpdir(), 'creatoros-e2e-'));
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...process.env,
      CREATOROS_USER_DATA: userData,
      CREATOROS_GATEWAY_PORT: String(GATEWAY_PORT),
      CREATOROS_GATEWAY_TOKEN: TOKEN,
      CREATOROS_AGENT_PROVIDER: 'mock',
      VITE_DEV_SERVER_URL: '',
    },
  });
  const window = await electronApp.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { electronApp, window, userData };
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${GATEWAY_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, ...(init?.headers ?? {}) },
  });
  const json = await res.json();
  return { status: res.status, json };
}

export const gw = {
  get: (path: string) => api(path),
  post: (path: string, body: unknown = {}) => api(path, { method: 'POST', body: JSON.stringify(body) }),
};

/** Wait for the gateway /health to answer — main process services are up. */
export async function waitForGateway(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${GATEWAY_BASE}/health`);
      if (r.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('gateway did not come up in time');
}

export const FIXTURE_PAGE_URL = FIXTURE_URL;
export { expect };
