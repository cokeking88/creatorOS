import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SettingsStore } from '../src/main/services/settings.js';

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

describe('SettingsStore', () => {
  it('roundtrips a provider config through SQLite', () => {
    const db = freshDb();
    const store = new SettingsStore(db);
    const cfg = { provider: 'anthropic' as const, anthropicKey: 'sk-1', anthropicModel: 'm1' };
    store.set(cfg);
    expect(store.get()).toEqual(cfg);
    db.close();
  });

  it('upserts: a second set overwrites, not duplicates', () => {
    const db = freshDb();
    const store = new SettingsStore(db);
    store.set({ provider: 'mock' });
    const second = { provider: 'openai-compatible' as const, compatBaseUrl: 'https://gw/v1', compatKey: 'k', compatModel: 'm' };
    store.set(second);
    const rows = db.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number };
    expect(rows.c).toBe(1);
    expect(store.get()).toEqual(second);
    db.close();
  });

  it('falls back to env config when the DB row is absent', () => {
    const db = freshDb();
    const prev = { ...process.env };
    try {
      process.env.CREATOROS_AGENT_PROVIDER = 'mock';
      const store = new SettingsStore(db);
      expect(store.get().provider).toBe('mock');
    } finally {
      process.env = prev;
      db.close();
    }
  });

  it('falls back to env config when the row is corrupt JSON', () => {
    const db = freshDb();
    const prev = { ...process.env };
    try {
      process.env.CREATOROS_AGENT_PROVIDER = 'mock';
      db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('provider', '{not json', 0)").run();
      const store = new SettingsStore(db);
      expect(store.get().provider).toBe('mock');
    } finally {
      process.env = prev;
      db.close();
    }
  });
});
