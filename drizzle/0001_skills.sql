-- v0.5 skills table (agent-capabilities §13.1). Runtime table creation stays in
-- db/index.ts's exec block (SKILLS_DDL is the single source); this file records
-- the schema change for the drizzle mirror in src/main/db/schema.ts.
-- NOTE: 0000_initial.sql has no meta/_journal.json snapshot, so drizzle-kit
-- generate cannot diff against it — written by hand in the 0000 file's style.
CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', prompt_template TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'manual', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
