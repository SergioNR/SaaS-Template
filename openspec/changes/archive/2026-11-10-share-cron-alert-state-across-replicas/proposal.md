# Proposal

## Why

Two pieces of scheduled-work state are still per process although the jobs are meant to behave as one platform-wide schedule:

1. **Upload-cleanup alert memory.** `previouslyFailedKeys` (`backend/server/cron/deletePendingFileUploadsScheduler.js:15`) is module state. Each 15-minute tick runs on whichever replica wins the advisory lock, so with two replicas the "alert once, then warn" rule degrades to "alert whenever the lock moves" - a stuck bucket object pages again every time a different replica runs the sweep, and a restarted replica always forgets.
2. **Session-store pruning.** `PrismaSessionStore` is created with `checkPeriod: 2 * 60 * 1000` (`backend/server/middlewares/storeExpressSessions.js:14`), so **every** replica runs its own prune every 2 minutes, outside the advisory-lock scheme every other job uses. The library's `prune()` loads every session row (`findMany` without a filter) and deletes expired ones one by one, so N replicas multiply a full-table read every 2 minutes, and its failures go to the library's console logger instead of our contained-error path. Expired sessions are already refused on read (the store's `get` deletes a session past `expiresAt`), so pruning is storage hygiene only.

## What Changes

- Upload-cleanup "new failure" detection is based on **shared, persisted state** (see design: a per-row marker on pending file rows, recommended), so a key alerts the first time it fails on **any** replica and only warns afterwards, across restarts.
- Session pruning moves from the store's interval to a **scheduled job** (`deleteExpiredSessions`) under its own advisory lock, so exactly one replica prunes per tick, with a single `DELETE ... WHERE "expiresAt" < now()` and the same error containment as the other jobs. The store's `checkPeriod` is disabled.
- Prune cadence becomes every 15 minutes (storage only; expired sessions are still refused on read immediately).
- One migration (if the per-row marker is chosen). No new env vars or routes.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `background-jobs`: upload-cleanup alerting becomes cross-replica; session pruning becomes a lock-guarded scheduled job.

## Impact

- `backend/prisma/schema.prisma` + new migration - `cleanup_failed_at DateTime?` on `File` (recommended option).
- `backend/server/models/pendingFileUploadsModel.js` - return each stale key with its marker; mark newly failed keys.
- `backend/server/cron/deletePendingFileUploadsScheduler.js` - drop `previouslyFailedKeys`; decide error vs warning from the marker.
- New `backend/server/cron/deleteExpiredSessionsScheduler.js`, `ADVISORY_LOCK_KEYS.cronExpiredSessions` in `config/advisoryLockKeys.js`, `deleteExpiredSessionsInDb` in `models/sessionModel.js`, registration in `cron/jobsContainer.js`.
- `backend/server/middlewares/storeExpressSessions.js` - `checkPeriod` removed (no interval).
- Tests: `tests/deletePendingFileUploadsScheduler.spec.js`, `tests/cleanupSchedulers.spec.js`, `tests/sessionModel.spec.js`, `tests/storeExpressSessions.spec.js`.
- `backend/AGENTS.md` cron section.

## Out of scope

- Sharing the transient-database-error counter from `include-error-code-in-alerts` (cannot live in the database it is about).
- Giving up on permanently stuck objects (an attempt counter could later stop retrying after N failures).
- Replacing the session store.
