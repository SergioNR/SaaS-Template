# Design

## Context

Every scheduled job runs through `runExclusiveCronTick(jobName, lockKey, task)`: `pg_try_advisory_xact_lock` inside a Prisma transaction, so one replica runs a tick and the others log a skip. The upload sweep lists stale pending rows (`getStalePendingFileKeysInDb`), deletes their objects (`deleteS3Objects` → `{ failedKeys }`), deletes rows for succeeded keys, and compares `failedKeys` with the in-memory `previouslyFailedKeys` to pick `logError` (new) or `logWarn` (same keys). Session expiry is handled by `@quixo3/prisma-session-store` (`checkPeriod` interval → `prune()`).

## Decisions

### Where the upload-cleanup failure memory lives
Options:
1. **Per-row marker `File.cleanup_failed_at` (recommended).** When a key fails, set `cleanup_failed_at = now()` on its row if null. A failure is "new" when its row had a null marker before the tick. Shared by construction (the row is the state), survives restarts, needs no extra table, and is naturally cleaned up because the row is deleted once its object deletion succeeds. Writes happen inside the tick, which already holds the job lock, so there is no race. Cost: one nullable column + migration and one `updateMany` per failing tick.
2. **Job-state table `CronJobState(job_name PK, state Json, updated_at)`.** Store the last failed key set as JSON. Generic and reusable for future jobs, but duplicates data the rows already describe, needs its own cleanup of stale keys, and the JSON grows with the failure set.
3. **Keep in memory, accept re-alerts.** Zero cost; contradicts the requirement on multi-replica deployments.

Semantics change slightly with option 1: today a key that failed, recovered for one tick and failed again re-alerts; with the marker it only ever alerts once per row. Since a recovered key's row is deleted, that difference only applies to rows whose object deletion succeeded but whose row delete failed - negligible.

### Session pruning
Options:
1. **Lock-guarded scheduled job (recommended).** `deleteExpiredSessionsScheduler` every 15 minutes (`*/15 * * * *`, offset from the upload sweep, e.g. `7-59/15`), `deleteMany({ where: { expiresAt: { lt: now } } })` using the existing `@@index([expiresAt])`, store `checkPeriod` disabled. One replica, one indexed delete, contained errors.
2. Keep the store's interval but only on one replica (env flag). Requires operator coordination and keeps the full-table `findMany`.
3. Keep the store's interval with a longer period. Still N× and unlocked.

### Cadence
15 minutes is enough: the store refuses an expired session on read, so pruning frequency affects table size only.

## Risks / Trade-offs

- [Migration on a hot table] → adding a nullable column without default is metadata-only on PostgreSQL.
- [Disabling `checkPeriod` without the job running] → the job is registered in `jobsContainer.js` in the same change; a spec asserts it is started and stopped with the others.

## Open questions for the implementer

- Include `cleanup_failed_at` in any API payload? Recommended: no - pending rows are never listed to clients.
- Exact minute offset for the session job; any value not colliding with `*/15` and the nightly 03:00 / 03:15 jobs works.

## Decisions taken at implementation

- Option 1 (per-row `File.cleanup_failed_at`) and the lock-guarded session job were taken. Migration: `20261111000001_file_cleanup_failed_at` (hand-written, checked against `prisma migrate diff --from-schema <previous schema> --to-schema prisma/schema.prisma --script`).
- `cleanup_failed_at` is not exposed in any API payload.
- Session job cadence: `7-59/15 * * * *` (minutes 7, 22, 37, 52), lock key `cronExpiredSessions = 7300004`.
- The sweep logs before writing the marker: if the marker write fails, the tick errors and the next run alerts again (one alert too many rather than a missed one).
- `getStalePendingFileKeysInDb` was renamed `getStalePendingFilesInDb` since it now returns `{ key, cleanupFailedAt }` objects.
