# Database

CreatorOS stores metadata in SQLite under Electron's `userData/data/creatoros.sqlite`.

The runtime bootstrap creates tables idempotently so a fresh checkout can launch without a separate migration command. The same initial schema is recorded in `drizzle/0000_initial.sql`, while `src/main/db/schema.ts` is the typed Drizzle schema.

For later schema changes, use Drizzle Kit:

```bash
npm run db:generate
# inspect generated SQL before applying
npm run db:push
```

For a production upgrade path, replace the bootstrap-only migration strategy with an explicit schema-version table and ordered migrations before distributing builds to multiple machines.
