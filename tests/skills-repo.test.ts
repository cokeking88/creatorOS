import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { SKILLS_DDL, SkillsRepo } from '../src/main/db/skillsRepo.js';

/**
 * AC-S1 (agent-capabilities §7.1/§13.9): skills table CRUD roundtrip against a
 * real :memory: SQLite. The injected-handle form (Pick<DatabaseSync,'prepare'>,
 * SettingsStore precedent) is what makes this testable without Electron.
 * The DDL comes from the exported SKILLS_DDL constant — the same string
 * db/index.ts executes, so this also proves idempotency of the real migration.
 */

function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(SKILLS_DDL);
  return db;
}

describe('SKILLS_DDL (AC-S1 idempotency)', () => {
  it('executing the same CREATE twice does not throw (IF NOT EXISTS, same as the 11 existing tables)', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => { db.exec(SKILLS_DDL); db.exec(SKILLS_DDL); }).not.toThrow();
    db.close();
  });
  it('matches the 7 columns of the §13.1 DDL exactly', () => {
    const db = freshDb();
    const cols = (db.prepare(`SELECT name FROM pragma_table_info('skills')`).all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(['id', 'name', 'description', 'prompt_template', 'origin', 'created_at', 'updated_at']);
    db.close();
  });
});

describe('SkillsRepo CRUD roundtrip (AC-S1)', () => {
  it('create -> list -> get -> update -> delete with defaults intact', () => {
    const db = freshDb();
    const repo = new SkillsRepo(db);

    // create: description defaults '', origin defaults 'manual'
    const created = repo.create({ name: '查登录态截图', promptTemplate: '打开 {账号} 的创作中心，检查登录状态并截图' });
    expect(created.id).toBeTruthy();
    expect(created.description).toBe('');
    expect(created.origin).toBe('manual');
    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBe(created.createdAt);

    // list: ordered by updated_at DESC
    expect(repo.list().map((s) => s.id)).toEqual([created.id]);

    // get by id
    expect(repo.get(created.id)?.promptTemplate).toContain('{账号}');
    expect(repo.get('missing')).toBeNull();

    // update: patch fields + refreshed updatedAt, others untouched
    const updated = repo.update(created.id, { name: '查登录态截图 v2', description: '检查登录状态' });
    expect(updated).toMatchObject({ id: created.id, name: '查登录态截图 v2', description: '检查登录状态', origin: 'manual' });
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    expect(repo.get('missing-id') === null).toBe(true);
    expect(repo.update('missing-id', { name: 'x' })).toBeNull();

    // delete: row gone, idempotent on missing id
    repo.delete(created.id);
    expect(repo.list()).toEqual([]);
    expect(() => repo.delete(created.id)).not.toThrow();
    db.close();
  });

  it('origin: explicit agent origin round-trips (the tool path); manual default never upgraded from client input here', () => {
    const db = freshDb();
    const repo = new SkillsRepo(db);
    const agentSkill = repo.create({ name: 'agent-made', promptTemplate: 'do things', origin: 'agent' });
    expect(repo.get(agentSkill.id)?.origin).toBe('agent');
    // DB is untyped TEXT: an unexpected value degrades to 'manual' on read, never crashes the state projection.
    db.prepare("INSERT INTO skills (id, name, description, prompt_template, origin, created_at, updated_at) VALUES ('weird','n','','p','alien',0,0)").run();
    expect(repo.get('weird')?.origin).toBe('manual');
    db.close();
  });
});
