import { app } from 'electron';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { drizzle } from 'drizzle-orm/node-sqlite';
import { browserProfiles, contents, jobs, workspaces, platforms } from './schema.js';
import { nanoid } from 'nanoid';

let sqlite: DatabaseSync;
export let db: ReturnType<typeof drizzle>;

export function initDatabase() {
  const file = join(app.getPath('userData'), 'data', 'creatoros.sqlite');
  mkdirSync(dirname(file), { recursive: true });
  sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS platforms (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, key TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, platform_id TEXT NOT NULL, name TEXT NOT NULL, handle TEXT, browser_profile_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS browser_profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, partition TEXT NOT NULL UNIQUE, platform TEXT, account_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contents (id TEXT PRIMARY KEY, platform TEXT NOT NULL, account_id TEXT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'draft', scheduled_at INTEGER, published_url TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, content_id TEXT, kind TEXT NOT NULL, path TEXT NOT NULL, mime_type TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS workflows (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, name TEXT NOT NULL, cron TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, workflow_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', last_run_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS job_runs (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, status TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT, output_json TEXT);
    CREATE TABLE IF NOT EXISTS agent_runs (id TEXT PRIMARY KEY, provider TEXT NOT NULL, status TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT, started_at INTEGER NOT NULL, finished_at INTEGER, error TEXT);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
  `);
  db = drizzle({ client: sqlite });
  seedDefaults();
  return db;
}

function seedDefaults() {
  const now0 = Date.now();
  const workspaceCount = sqlite.prepare('SELECT COUNT(*) AS c FROM workspaces').get() as { c: number };
  if (!workspaceCount.c) db.insert(workspaces).values({ id:'default', name:'Creator Workspace', createdAt:now0, updatedAt:now0 }).run();
  const platformCount = sqlite.prepare('SELECT COUNT(*) AS c FROM platforms').get() as { c: number };
  if (!platformCount.c) {
    db.insert(platforms).values([
      {id:'xiaohongshu',workspaceId:'default',name:'小红书',key:'xiaohongshu',createdAt:now0,updatedAt:now0},
      {id:'douyin',workspaceId:'default',name:'抖音',key:'douyin',createdAt:now0,updatedAt:now0},
      {id:'bilibili',workspaceId:'default',name:'Bilibili',key:'bilibili',createdAt:now0,updatedAt:now0},
      {id:'wechat',workspaceId:'default',name:'微信公众号',key:'wechat',createdAt:now0,updatedAt:now0}
    ]).run();
  }
  const profileCount = sqlite.prepare('SELECT COUNT(*) AS c FROM browser_profiles').get() as { c: number };
  if (!profileCount.c) {
    const now = Date.now();
    db.insert(browserProfiles).values({ id: nanoid(), name: 'Main Creator', partition: 'persist:creator-main', platform: 'general', accountId: null, createdAt: now, updatedAt: now }).run();
  }
  const contentCount = sqlite.prepare('SELECT COUNT(*) AS c FROM contents').get() as { c: number };
  if (!contentCount.c) {
    const now = Date.now();
    db.insert(contents).values({ id: nanoid(), platform: 'xiaohongshu', title: '欢迎使用 CreatorOS', body: '这是一个本地草稿示例。', status: 'draft', createdAt: now, updatedAt: now }).run();
  }
  const jobCount = sqlite.prepare('SELECT COUNT(*) AS c FROM jobs').get() as { c: number };
  if (!jobCount.c) {
    const now = Date.now();
    db.insert(jobs).values({ id: nanoid(), name: 'Daily demo', cron: '0 9 * * *', enabled: false, workflowType: 'demo', payloadJson: '{}', createdAt: now, updatedAt: now }).run();
  }
}

export function rawSqlite() { return sqlite; }

/** Test hook: point the module at an externally created database (initDatabase uses Electron paths). */
export function setSqliteForTesting(external: DatabaseSync) { sqlite = external; }
