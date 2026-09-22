/**
 * Skills repository — the single SQL owner for the `skills` table
 * (agent-capabilities spec §13.1, D7 / AC-S1).
 *
 * Injected-handle form, verbatim the SettingsStore precedent
 * (`src/main/services/settings.ts:9-11`, `tests/settings.test.ts`): the repo
 * takes a `Pick<DatabaseSync,'prepare'>` so vitest can point it at a
 * `:memory:` database. `repository.ts` re-exports the class for callers but
 * deliberately does NOT fold it into the `repo` object — the `repo` object is
 * module-bound to the production db and therefore not unit-testable (§13.10.1).
 *
 * Module imports: node:sqlite types / nanoid / shared types only — ZERO
 * Electron. `origin` is never taken from client input: the calling layer
 * hardcodes 'manual' (IPC handler) or 'agent' (skill_create tool); the DDL
 * default is only a backstop.
 */
import type { DatabaseSync } from 'node:sqlite';
import { nanoid } from 'nanoid';
import type { SkillRecord } from '../../shared/types.js';

/** DDL single source: db/index.ts's second exec block and vitest share this exact string (§13.1, no dual drift). */
export const SKILLS_DDL = `CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  prompt_template TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);`;

export type SkillsDb = Pick<DatabaseSync, 'prepare'>;

export type CreateSkillInput = { name: string; description?: string; promptTemplate: string; origin?: 'manual' | 'agent' };
export type UpdateSkillPatch = { name?: string; description?: string; promptTemplate?: string };

/** SQLite row shape (snake_case) -> SkillRecord (camelCase). */
function rowToSkill(r: Record<string, unknown>): SkillRecord {
  return { id: String(r.id), name: String(r.name), description: String(r.description ?? ''), promptTemplate: String(r.prompt_template ?? ''), origin: r.origin === 'agent' ? 'agent' : 'manual', createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) };
}

export class SkillsRepo {
  constructor(private db: SkillsDb) {}

  list(): SkillRecord[] { return (this.db.prepare('SELECT * FROM skills ORDER BY updated_at DESC').all() as Array<Record<string, unknown>>).map(rowToSkill); }

  get(id: string): SkillRecord | null {
    const r = this.db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return r ? rowToSkill(r) : null;
  }

  create(input: CreateSkillInput): SkillRecord {
    const now = Date.now();
    const row = { id: nanoid(), name: input.name, description: input.description ?? '', promptTemplate: input.promptTemplate, origin: input.origin ?? 'manual', createdAt: now, updatedAt: now };
    this.db.prepare('INSERT INTO skills (id, name, description, prompt_template, origin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(row.id, row.name, row.description, row.promptTemplate, row.origin, row.createdAt, row.updatedAt);
    return row;
  }

  /** Patch -> UPDATE (updatedAt refreshed) -> re-read; missing id returns null. */
  update(id: string, patch: UpdateSkillPatch): SkillRecord | null {
    const current = this.get(id);
    if (!current) return null;
    const next = {
      name: patch.name ?? current.name,
      description: patch.description ?? current.description,
      promptTemplate: patch.promptTemplate ?? current.promptTemplate,
      updatedAt: Date.now(),
    };
    this.db.prepare('UPDATE skills SET name = ?, description = ?, prompt_template = ?, updated_at = ? WHERE id = ?')
      .run(next.name, next.description, next.promptTemplate, next.updatedAt, id);
    return this.get(id);
  }

  delete(id: string): void { this.db.prepare('DELETE FROM skills WHERE id = ?').run(id); }
}
