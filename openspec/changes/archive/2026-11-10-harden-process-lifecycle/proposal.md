# Proposal

## Why

Two lifecycle paths lose work at exactly the moment it matters:

1. **Crash alerts never leave the process.** `crashProcess` (`backend/server/app.js:43-47`) calls `logError` - which starts the Telegram `fetch` fire-and-forget - then `flushLogs()` and `process.exit(1)` synchronously. The exit kills the pending request, so an unhandled rejection or uncaught exception is logged to stdout/Better Stack but **never pages anyone**, although "crash" is the most alert-worthy event the API has.
2. **Shutdown does not wait for a running cron tick.** `stopCronJobs` (`backend/server/cron/jobsContainer.js:21-29`) calls `CronJob.stop()` on each job and discards the result. With `waitForCompletion: true` (all three jobs), cron 4.x `stop()` returns a promise that resolves once the running callback finishes - but nobody awaits it. `gracefulShutdown` (`app.js:83-117`) then drains requests and `trackBackground` work and calls `prisma.$disconnect()` while a tick (for example an upload sweep between its bucket delete and its row delete) may still be using the database. The tick then fails with a connection error that alerts, during a routine deploy.

## What Changes

- The crash handlers send the crash alert and **wait for it, bounded by 3 seconds**, before flushing logs and exiting with code 1. A second crash event while waiting is logged but does not restart or extend the wait.
- Graceful shutdown stops scheduling, then **waits for in-flight cron ticks** in parallel with in-flight requests and tracked background work, inside the existing 8-second drain budget (10-second hard ceiling unchanged). A tick still running after the drain is logged as a warning and abandoned before the database closes (its advisory-lock transaction rolls back, so the lock is released; every job is idempotent and resumes on the next tick).
- No new routes, env vars or migrations.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `observability`: crash handlers await the alert (bounded); graceful shutdown drains running job ticks.
- `background-jobs`: jobs-lifecycle requirement covers waiting for the running tick at shutdown.

## Impact

- `backend/server/config/loggerFunctions.js` - `logError` returns the alert promise (callers keep ignoring it), or a dedicated `logErrorAndAlert` that does; see design.
- `backend/server/app.js` - `crashProcess` becomes async with a bounded wait and a re-entrancy guard; `gracefulShutdown` awaits `stopCronJobs()` alongside `closeServer()` / `waitForBackgroundTasks()` within `BACKGROUND_TASKS_DRAIN_TIMEOUT_MS`.
- `backend/server/cron/jobsContainer.js` - `stopCronJobs` returns a promise of every job's `stop()`.
- Possibly `backend/server/utils/processLifecycle.js` - a shared `raceWithTimeout` helper (already the shape of `waitForBackgroundTasks`).
- Tests: `tests/processLifecycle.spec.js`, a new `jobsContainer` spec or `cleanupSchedulers.spec.js`, `tests/loggerFunctions.spec.js`.
- `backend/AGENTS.md` Process bullet.

## Out of scope

- Tracking ordinary fire-and-forget alerts (`logError` during request handling) as background work for the shutdown drain.
- Changing the 8 s / 10 s budgets or the crash-exit semantics (still exit 1; no attempt to keep serving).
- The process supervisor / restart policy (compose `restart:` settings).
