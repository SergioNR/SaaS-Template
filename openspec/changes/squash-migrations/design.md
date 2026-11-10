# Design

## Context

Prisma records applied migrations by name in `_prisma_migrations`. `start.sh` runs `prisma migrate deploy` on every container start. The history contains schema DDL plus data steps whose effects on a fresh database reduce to reference rows (roles, permissions, grants) and the `citext` extension.

## Decisions

### What goes into `0_init`

- **A. `prisma migrate diff --from-empty --to-schema-datamodel` DDL + hand-appended reference-data inserts + `CREATE EXTENSION` (recommended).** Same approach as Wesel; deterministic and reviewable.
- B. `pg_dump --schema-only` of a migrated database. Rejected: emits Postgres-version-specific noise and no data.

Data-repair steps (orphan deletes, `sub_` id copy, case-duplicate checks) are dropped: on a fresh database they are no-ops, and existing databases never re-run them.

### When to squash

The legacy list must be exactly the set of migrations every live database has applied. Options:
- **A. Squash after all in-flight backend changes with migrations have merged and deployed to staging (recommended)**; the legacy list then covers them too.
- B. Squash now and let later migrations sort after `0_init`. Works too (names like `2026…` sort after `0_init`), but a database that deployed an in-flight migration before the squash image would be "partial" by the bridge's rules unless that migration is in the list.

### Bridge behaviour

Port Wesel's three outcomes unchanged: no history → nothing (deploy applies `0_init`); full legacy history → `prisma migrate resolve --applied 0_init`; partial history → refuse to start with a message naming the last pre-squash image to deploy first. `0_init` already recorded → nothing.

## Risks / Trade-offs

- A fork that edited a legacy migration locally gets "full history" but a different schema → the bridge cannot detect it; documented in the README note.
- The equivalence diff depends on the Postgres major version; run both sides on the same image as `compose.yaml`.

## Open questions

- Which image tag is "the last pre-squash image" to name in the refusal message (the merge commit of the squash PR's predecessor)?
- Keep the old migrations in git history only, or also in an `archive/` folder outside `prisma/migrations`? Default: git history only.
