# Tasks

## 1. Preconditions

- [x] 1.1 Real-database verification of the legacy migrations moved to `enable-ci-and-first-verification` (group 4): existing databases still reach the new image through the old history (the bridge refuses a partial one), so that verification stays meaningful after the squash
- [x] 1.2 Every in-flight change that adds a migration landed first (batches A and B: `20261111000001_file_cleanup_failed_at`, `20261111000002_rate_limit_hits`, `20261112100000_email_verification`); legacy list frozen at 15 migrations

## 2. Reference database

- [x] 2.1 Database A: the 15 legacy migrations applied in name order to a fresh in-process Postgres (PGlite 0.5.14 with the `citext` contrib extension - Docker is not available on the authoring machine; see design.md)
- [x] 2.2 Normalized dump of A: extensions, enums, columns (types, nullability, defaults), constraints (`pg_get_constraintdef`), indexes (`pg_indexes`) and every non-empty table's rows minus timestamps (the reference rows)

## 3. Baseline

- [x] 3.1 Legacy folders removed; `prisma/migrations/0_init/migration.sql` = `CREATE EXTENSION IF NOT EXISTS citext` + `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script` + the `User_superadmin_has_no_company_check` constraint + role / permission / grant inserts (deterministic ids, joined by name)
- [x] 3.2 Database B from `0_init` alone; its dump is identical to A's. Negative check: dropping the CHECK constraint and one grant from a copy of `0_init` makes the diff report exactly those two lines
- [x] 3.3 The schema/migrations equivalence is the 3.2 diff (`prisma migrate diff --from-migrations` needs a shadow database); `npx prisma db seed` on a real database moved to `enable-ci-and-first-verification` 4.5

## 4. Bridge

- [x] 4.1 `backend/prisma/baselineSquashedMigrations.js` (frozen `LEGACY_MIGRATIONS`, pure `baselineAction()`, `migrate resolve --applied 0_init`), run by `backend/start.sh` before `prisma migrate deploy`
- [x] 4.2 `backend/tests/baselineSquashedMigrations.spec.js`: no history → none; `0_init` recorded → none; full legacy → resolve; partial → refuse naming the missing migrations; the list has no duplicates; `0_init` sorts first and no legacy folder ships again
- [x] 4.3 Manual bridge run against real databases (old history → resolves and boots; one legacy row deleted → refuses; empty → applies `0_init`) moved to `enable-ci-and-first-verification` 4.6

## 5. Docs and verification

- [x] 5.1 `backend/AGENTS.md` (baseline, bridge, removal condition, unique timestamps) and `backend/README.md` (operator note)
- [x] 5.2 `npm test` and `npx eslint .` pass in `backend/`
- [x] 5.3 Staging deploy with the bridge log line `[baseline] complete pre-squash history` moved to `enable-ci-and-first-verification` 4.6
