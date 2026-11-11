# Proposal

## Why

`backend/prisma/migrations/` holds 12 migrations for a template that has never had a production release worth preserving history for, and two of them share the timestamp `20261021090000` (`_company_admin_manage_roles` and `_file_uploads`) — their relative order depends on name sorting, a trap for anyone adding a migration with the same prefix. Every fork inherits this history, replays it on each fresh database and has to reason about data steps (role/permission inserts, superadmin detachment, `sub_` id moves, citext conversion) that only matter for databases that existed before them. A single `0_init` baseline makes fresh setups faster and the schema history readable.

Already-migrated databases (staging, any running fork) would break on a naive squash: `prisma migrate deploy` would try to apply `0_init` on top of existing tables. Wesel solved this with a start-up bridge (`Wesel/backend/prisma/baselineSquashedMigrations.js` + `tests/baselineSquashedMigrations.spec.js`, wired in `start.sh`; Wesel commits `2941356`, `7898017`) that marks the baseline as applied when the full legacy history is present and refuses to start on a partial one.

No API or UI behaviour changes; the resulting schema and reference data are byte-for-byte equivalent, so the change carries no spec delta (`skip_specs: true`).

## What Changes

- Replace all current migrations with one `0_init` migration generated from `schema.prisma`, plus the reference-data inserts (roles, permissions, role-permission grants) and `CREATE EXTENSION IF NOT EXISTS citext`.
- Port the baseline bridge: `prisma/baselineSquashedMigrations.js` with the legacy migration list, pure `baselineAction()` decision (none / resolve / refuse), its spec, and a `start.sh` step before `prisma migrate deploy`.
- Prove equivalence with a `pg_dump --schema-only` diff and a reference-data diff between a database migrated with the old history and one migrated with `0_init`.
- Document the bridge and its removal condition.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none: migration housekeeping only (skip_specs) -->

## Impact

- `backend/prisma/migrations/**` (all replaced), new `backend/prisma/baselineSquashedMigrations.js`, `backend/start.sh`, new `backend/tests/baselineSquashedMigrations.spec.js`, `backend/eslint.config.js` if the script needs a `no-console` exception, `backend/README.md` / `backend/AGENTS.md` (migrations section), seed if it depends on migration-inserted rows.
- Needs a real Postgres (Docker) for the equivalence proof.
- **Depends on** `enable-ci-and-first-verification` (the two newest migrations must have been run against real data first) and should land **after** any in-flight backend change that adds a migration (e.g. `add-email-verification`), or include those migrations in the legacy list — see design.md.

## Out of scope

- Any schema change — the baseline must be equivalent to the current history.
- Removing the bridge (a later chore once every environment records `0_init`).
