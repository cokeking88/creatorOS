import type { DatabaseSync } from 'node:sqlite';
import { rawSqlite } from '../db/index.js';
import type { ProviderConfig, ProviderTestResult } from '../../shared/types.js';
import { configFromEnv, createProviderFromConfig } from '../agent/providers.js';
import { logger } from './logger.js';

const KEY = 'provider';
const log = logger.child('settings');

type SettingsDb = Pick<DatabaseSync, 'prepare'>;

/** Settings store over any sqlite handle — thin wrapper, unit-testable without Electron. */
export class SettingsStore {
  constructor(private db: SettingsDb) {}

  readRaw(): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
    return row?.value ?? null;
  }

  get(): ProviderConfig {
    const raw = this.readRaw();
    if (raw) {
      try { return JSON.parse(raw) as ProviderConfig; } catch { log.warn('Corrupt provider settings, falling back to env', { raw: raw.slice(0, 80) }); }
    }
    return configFromEnv();
  }

  set(cfg: ProviderConfig): ProviderConfig {
    const value = JSON.stringify(cfg);
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    ).run(KEY, value, now);
    log.info('Provider config saved', { provider: cfg.provider });
    return cfg;
  }
}

/** App-wide store bound to the main-process database. */
export const settingsStore = new SettingsStore({
  prepare: (sql: string) => rawSqlite().prepare(sql),
});

export function getProviderConfig(): ProviderConfig { return settingsStore.get(); }
export function setProviderConfig(cfg: ProviderConfig): ProviderConfig { return settingsStore.set(cfg); }

/** One-shot completion against the current config. Returns a UI-friendly result; never throws. */
export async function testProviderConnection(): Promise<ProviderTestResult> {
  const cfg = getProviderConfig();
  const provider = createProviderFromConfig(cfg);
  try {
    const reply = await provider.complete([{ role: 'user', content: 'ping' }]);
    log.info('Provider test succeeded', { provider: provider.name });
    return { ok: true, provider: provider.name, detail: reply.slice(0, 200) };
  } catch (e) {
    const detail = String(e);
    log.warn('Provider test failed', { provider: provider.name, detail });
    return { ok: false, provider: provider.name, detail };
  }
}