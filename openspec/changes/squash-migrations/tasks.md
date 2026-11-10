# Tasks

## 1. Preconditions

- [ ] 1.1 `enable-ci-and-first-verification` task group 4 (migrations on real data) is done
- [ ] 1.2 All in-flight backend changes that add migrations are merged and deployed to staging; freeze the legacy list (`ls backend/prisma/migrations`)

## 2. Reference database

- [ ] 2.1 Start a throwaway Postgres with the same image as `compose.yaml`; `npx prisma migrate deploy` with the current history → database A
- [ ] 2.2 `pg_dump --schema-only --no-owner A > a.sql`; `pg_dump --data-only --table='"Role"' --table='"Permission"' --table='"RolePermission"' A > a-ref.sql`

## 3. Baseline

- [ ] 3.1 Move the current migrations out; generate `prisma/migrations/0_init/migration.sql` with `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`; prepend `CREATE EXTENSION IF NOT EXISTS citext;`; append the role/permission/grant inserts exactly as the legacy migrations produce them
- [ ] 3.2 Fresh Postgres → `npx prisma migrate deploy` → database B; dump the same two files; `diff a.sql b.sql` and `diff a-ref.sql b-ref.sql` are empty (ignoring dump header comments)
- [ ] 3.3 `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` reports no difference; `npx prisma db seed` works on B

## 4. Bridge

- [ ] 4.1 Port `backend/prisma/baselineSquashedMigrations.js` (legacy list from 1.2, `baselineAction()`, `migrate resolve --applied 0_init`); wire it in `backend/start.sh` before `prisma migrate deploy`
- [ ] 4.2 Port `backend/tests/baselineSquashedMigrations.spec.js`: no history → none; `0_init` recorded → none; full legacy → resolve; partial → refuse with the missing names
- [ ] 4.3 Manual: on database A (old history) run `start.sh` → bridge resolves, deploy is a no-op, app boots; on a copy of A with one legacy row deleted → refuses to start; on an empty DB → deploy applies `0_init`

## 5. Docs and verification

- [ ] 5.1 `backend/README.md` + `backend/AGENTS.md`: baseline note, bridge purpose and removal condition; never reuse a migration timestamp
- [ ] 5.2 `npm test` and `npx eslint .` in `backend/` pass; CI PR gate green
- [ ] 5.3 Deploy to staging (already-migrated DB) and confirm the bridge log line `[baseline] complete pre-squash history`
