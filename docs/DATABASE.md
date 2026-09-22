# Database

CreatorOS stores metadata in SQLite under Electron's `userData/data/creatoros.sqlite`.

Tables: workspaces, platforms, accounts, browser_profiles, contents, assets, jobs, job_runs, agent_runs, settings, and — since v0.5 — `skills` (id/name/description/prompt_template/origin[`manual`|`agent`]/created_at/updated_at; DDL single-sourced in `src/main/db/skillsRepo.ts` `SKILLS_DDL`, drizzle mirror in `drizzle/0001_skills.sql`). Agent-run skill binding is a soft reference: jobs store `{skillId, prompt}` in `payload_json` (exactly one non-null, validated at `Scheduler.createJob`); deleting a skill leaves the job in place and its next run fails with a readable error.

The runtime bootstrap creates tables idempotently so a fresh checkout can launch without a separate migration command. The same initial schema is recorded in `drizzle/0000_initial.sql`, while `src/main/db/schema.ts` is the typed Drizzle schema.

For later schema changes, use Drizzle Kit:

```bash
npm run db:generate
# inspect generated SQL before applying
npm run db:push
```

For a production upgrade path, replace the bootstrap-only migration strategy with an explicit schema-version table and ordered migrations before distributing builds to multiple machines.
