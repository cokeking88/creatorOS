import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsStore, engineConfigFromEnv } from '../src/main/services/settings.js';

const dirs: string[] = [];
function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), 'creatoros-settings-ut-'));
  dirs.push(dir);
  const db = new DatabaseSync(join(dir, 'settings-ut.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
  return db;
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Hermetic env: clear all engine vars so ambient shell values cannot leak into assertions. */
function clearEngineEnv() {
  delete process.env.ANTHROPIC_BASE_URL;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_MODEL;
}

describe('SettingsStore (agent engine config)', () => {
  it('roundtrips an AgentEngineConfig through SQLite', () => {
    const db = freshDb();
    const store = new SettingsStore(db);
    const cfg = { baseUrl: 'https://relay.internal/v1', authToken: 'tok-1', model: 'claude-sonnet-4-5' };
    store.set(cfg);
    expect(store.get()).toEqual(cfg);
    db.close();
  });

  it('upserts: a second set overwrites, not duplicates', () => {
    const db = freshDb();
    const store = new SettingsStore(db);
    store.set({ model: 'a' });
    const second = { apiKey: 'sk-2', model: 'b' };
    store.set(second);
    const rows = db.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number };
    expect(rows.c).toBe(1);
    expect(store.get()).toEqual(second);
    db.close();
  });

  it('migrates legacy v0.2 provider rows back to the env-derived engine config', () => {
    const db = freshDb();
    const prev = { ...process.env };
    try {
      clearEngineEnv();
      process.env.ANTHROPIC_BASE_URL = 'https://relay.env/v1';
      process.env.ANTHROPIC_AUTH_TOKEN = 'env-tok';
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('agent-engine', '{\"provider\":\"anthropic\"}', 0)").run();
      const store = new SettingsStore(db);
      expect(store.get()).toEqual({ baseUrl: 'https://relay.env/v1', authToken: 'env-tok' });
    } finally {
      process.env = prev;
      db.close();
    }
  });

  it('falls back to env config when the row is absent or corrupt', () => {
    const db = freshDb();
    const prev = { ...process.env };
    try {
      clearEngineEnv();
      process.env.ANTHROPIC_MODEL = 'm-env';
      const store = new SettingsStore(db);
      expect(store.get()).toEqual({ model: 'm-env' });
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('agent-engine', '{not json', 0)").run();
      expect(store.get()).toEqual({ model: 'm-env' });
    } finally {
      process.env = prev;
      db.close();
    }
  });
});

describe('engineConfigFromEnv', () => {
  it('maps all four env vars', () => {
    const prev = { ...process.env };
    try {
      clearEngineEnv();
      process.env.ANTHROPIC_BASE_URL = 'https://gw/v1';
      process.env.ANTHROPIC_AUTH_TOKEN = 't';
      process.env.ANTHROPIC_API_KEY = 'k';
      process.env.ANTHROPIC_MODEL = 'm';
      expect(engineConfigFromEnv()).toEqual({ baseUrl: 'https://gw/v1', authToken: 't', apiKey: 'k', model: 'm' });
    } finally {
      process.env = prev;
    }
  });
});
