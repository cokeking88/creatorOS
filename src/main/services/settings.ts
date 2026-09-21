import type { DatabaseSync } from 'node:sqlite';
import { rawSqlite } from '../db/index.js';
import type { AgentEngineConfig } from '../../shared/types.js';
import { logger } from './logger.js';

const KEY = 'agent-engine';
const log = logger.child('settings');

type SettingsDb = Pick<DatabaseSync, 'prepare'>;

/** Settings store over any sqlite handle — thin wrapper, unit-testable without Electron. */
export class SettingsStore {
  constructor(private db: SettingsDb) {}

  readRaw(): string | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY) as { value: string } | undefined;
    return row?.value ?? null;
  }

  get(): AgentEngineConfig {
    const raw = this.readRaw();
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        // Migrate legacy provider-config rows (v0.2 shape) to the engine config.
        if ('provider' in parsed) return engineConfigFromEnv();
        return parsed as AgentEngineConfig;
      } catch { log.warn('Corrupt agent engine settings, falling back to env', { raw: raw.slice(0, 80) }); }
    }
    return engineConfigFromEnv();
  }

  set(cfg: AgentEngineConfig): AgentEngineConfig {
    const value = JSON.stringify(cfg);
    const now = Date.now();
    this.db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    ).run(KEY, value, now);
    log.info('Agent engine config saved', { baseUrl: cfg.baseUrl, model: cfg.model });
    return cfg;
  }
}

/** Env fallback (also the v0.2 legacy-row migration target). */
export function engineConfigFromEnv(): AgentEngineConfig {
  return {
    ...(process.env.ANTHROPIC_BASE_URL ? { baseUrl: process.env.ANTHROPIC_BASE_URL } : {}),
    ...(process.env.ANTHROPIC_AUTH_TOKEN ? { authToken: process.env.ANTHROPIC_AUTH_TOKEN } : {}),
    ...(process.env.ANTHROPIC_API_KEY ? { apiKey: process.env.ANTHROPIC_API_KEY } : {}),
    ...(process.env.ANTHROPIC_MODEL ? { model: process.env.ANTHROPIC_MODEL } : {}),
  };
}

/** App-wide store bound to the main-process database. */
export const settingsStore = new SettingsStore({
  prepare: (sql: string) => rawSqlite().prepare(sql),
});

export function getAgentEngineConfig(): AgentEngineConfig { return settingsStore.get(); }
export function setAgentEngineConfig(cfg: AgentEngineConfig): AgentEngineConfig { return settingsStore.set(cfg); }