# Design

## Context

`logError` logs through pino and calls `sendErrorLogsToTelegram(...)` without awaiting; `sendTelegramMessage` already has a 5 s `AbortSignal.timeout` and never throws. The crash path exits synchronously. Cron jobs are `CronJob.from({ ..., waitForCompletion: true })`; in cron 4.4 `stop()` clears the timer and, when `waitForCompletion` is set, returns a promise that polls `_isCallbackRunning` every 100 ms and then runs `onComplete`. Ticks run inside `runWithAdvisoryLockInDb` (`pg_try_advisory_xact_lock` inside a Prisma interactive transaction with a 10-minute timeout).

## Decisions

### How the crash path gets a promise to await
Options:
1. **`logError` returns the alert promise (recommended).** One-line change; every existing caller ignores the return value, so behaviour elsewhere is unchanged. The crash handler does `await raceWithTimeout(logError(...), 3000)`.
2. A separate `logErrorAndAlert` export. Avoids touching `logError`'s contract but duplicates its body and the try/catch.
3. Call `sendErrorLogsToTelegram` directly from `app.js`. Breaks the "integrations only via loggerFunctions" layering and double-logs.

The returned promise must never reject (the integration already swallows), and `logError` must still never throw.

### Crash wait bound: 3 s
Below the 5 s Telegram timeout and well under typical supervisor kill windows; a hung Telegram API delays the restart by at most 3 s. The race itself must keep the process alive, so this timer **must not** be `unref`'d (unlike the shutdown timers); it is cleared once the alert settles.

### Re-entrancy
A module-level `crashing` flag: the first crash event starts the wait; later `unhandledRejection`/`uncaughtException` events are logged (pino only, no extra alert wait) and return. `process.exit(1)` happens once.

### Cron drain inside the existing budget
`stopCronJobs()` returns `Promise.allSettled(jobs.map((job) => job.stop()))`. `gracefulShutdown` races `Promise.all([closeServer(), waitForBackgroundTasks(...), cronDrain])` against the same 8 s budget (one shared deadline, not three sequential ones). If the cron drain loses the race, log `logWarn('Cron tick still running at shutdown - abandoning it')`; `prisma.$disconnect()` then ends the tick's transaction, which releases the advisory lock. Jobs are idempotent: an abandoned upload sweep leaves rows whose objects may already be gone, and the next tick treats a missing object as success.

## Risks / Trade-offs

- [Abandoned tick logs a connection error after disconnect, which alerts] → acceptable but noisy; the implementer may suppress errors raised by a tick after `isShuttingDown()` (downgrade to warning) - see open question.
- [Crash during startup before Telegram config loads] → `sendTelegramMessage` is a no-op without configuration; the race resolves immediately.

## Open questions for the implementer

- Downgrade cron tick errors raised after shutdown started to warnings? Recommended: yes, in `runExclusiveCronTick` via `isShuttingDown()`; it is the same file `include-error-code-in-alerts` touches, so coordinate if both are in flight.
- Should the crash alert bypass the 60 s dedupe? Recommended: no - a crash loop restarting every few seconds should not page on every restart.

## Decisions taken at implementation

- **Post-shutdown tick errors are downgraded** to `logWarn` in `runExclusiveCronTick` (checked first, before the transient-error rule from `include-error-code-in-alerts`).
- **The crash alert keeps the 60 s dedupe** (no bypass).
- Option 1 (`logError` returns the alert promise) was taken. The crash handler and the shutdown sequence moved into `utils/processLifecycle.js` as dependency-injected factories (`createCrashHandler`, `createGracefulShutdown`) so they are unit-tested without a real `process.exit`; `app.js` only wires them. `raceWithTimeout` is shared by both and by `waitForBackgroundTasks`.
