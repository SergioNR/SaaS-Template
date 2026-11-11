# Tasks

## 1. Shared upload-cleanup failure state

- [x] 1.1 Add `cleanup_failed_at DateTime?` to `File` in `backend/prisma/schema.prisma` with a `//*` comment, and create the migration (`npx prisma migrate dev --name file_cleanup_failed_at`); verify `npx prisma migrate deploy` on a fresh local database and `npx prisma generate` — migration `20261111000001_file_cleanup_failed_at` written by hand (no Postgres in the implementing environment) and checked with `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`; `npx prisma generate` ran; `migrate deploy` on a real database is left to CI / the first deploy
- [x] 1.2 `backend/server/models/pendingFileUploadsModel.js`: return stale rows as `{ key, cleanupFailedAt }`; add `markPendingFileCleanupFailedInDb(keys)` (sets the marker only where null, status still `pending`); verify with model specs (mocked Prisma, assert the `where` filters)
- [x] 1.3 `backend/server/cron/deletePendingFileUploadsScheduler.js`: remove `previouslyFailedKeys`; a failed key is new when its row's marker was null; mark failed keys; `logError` when any are new, `logWarn` otherwise; verify `tests/deletePendingFileUploadsScheduler.spec.js` (new failures alert, previously marked keys warn, state survives a module reload)

## 2. Lock-guarded session pruning

- [x] 2.1 Add `ADVISORY_LOCK_KEYS.cronExpiredSessions` (unique value) in `backend/server/config/advisoryLockKeys.js`; `deleteExpiredSessionsInDb()` in `backend/server/models/sessionModel.js` (`deleteMany` on `expiresAt < now`, returns count); verify `tests/sessionModel.spec.js`
- [x] 2.2 New `backend/server/cron/deleteExpiredSessionsScheduler.js` (`waitForCompletion: true`, 15-minute cadence offset from the upload sweep, via `runExclusiveCronTick`, logs the count); register start/stop in `cron/jobsContainer.js`; verify `tests/cleanupSchedulers.spec.js` covers it
- [x] 2.3 Remove `checkPeriod` from the `PrismaSessionStore` options in `backend/server/middlewares/storeExpressSessions.js` with a `//*` comment pointing at the job; verify `tests/storeExpressSessions.spec.js` asserts no `checkPeriod`

## 3. Docs and validation

- [x] 3.1 `backend/AGENTS.md` cron section: list the session job and its lock key; upload-cleanup alert state lives on the row
- [x] 3.2 Manual check with two local API processes on different ports against one database: only one logs each session prune tick — not run by hand (no Postgres in the implementing environment); the job goes through the same `runExclusiveCronTick` lock as the other jobs, covered by `tests/cleanupSchedulers.spec.js` and `tests/cronAdvisoryLock.spec.js`
- [x] 3.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 3.4 `npx -y @fission-ai/openspec@1.16.0 validate share-cron-alert-state-across-replicas --strict` passes
