# Proposal

## Why

Telegram alerts (`backend/server/integrations/telegram/sendLogsToTelegram.js`) show the error name, the log message and `error.message`, but never `error.code`, although `serializeError` (`config/loggerFunctions.js`) already whitelists it. For the most common production incident - the database going away - that leaves the alert empty of meaning: with the pg driver adapter, a `prisma.file.findMany()` against a host whose addresses refuse connections (verified against `localhost:<closed port>`, which resolves to both `::1` and `127.0.0.1`) throws `PrismaClientKnownRequestError` with `code: "ECONNREFUSED"` and a `message` that is only the ``Invalid `prisma.file.findMany()` invocation:`` header. The alert reads "Error Details: Invalid ... invocation:" and nothing else.

The same outage also pages repeatedly from cron: every tick of every job fails in `runExclusiveCronTick` (`cron/exclusiveCronTick.js`) while acquiring its advisory lock and calls `logError`, so a 20-minute database restart produces an alert per job per tick (deduped only per identical message for 60 s). Transient connectivity blips that heal by the next tick should not page anyone.

## What Changes

- Alerts gain an **Error Code** line (`N/A` when absent).
- When the error message is empty or carries nothing beyond a Prisma ``Invalid `...` invocation:`` header, the alert's details fall back to the error code, so the alert always says what happened.
- The alert dedupe key includes the error code, so two different failures with the same empty message are not collapsed into one alert.
- Cron ticks that fail with a **transient database connectivity error** (`P1001`, `P1017`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`, on the error or its `cause`) log a **warning** instead of an error, until the same job has failed that way on **3 consecutive ticks in this process**; then it logs an error (alerting) and keeps warning until a tick succeeds, which resets the count. Non-transient errors still alert on the first occurrence.
- No new routes, env vars or migrations.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `observability`: alert format gains the error code and the empty-message fallback; dedupe key includes the code.
- `background-jobs`: job error containment distinguishes transient database connectivity errors and downgrades them until they repeat.

## Impact

- `backend/server/integrations/telegram/sendLogsToTelegram.js` - Error Code line, details fallback, dedupe key.
- `backend/server/utils/prismaErrors.js` - new pure `isTransientDatabaseError(error)` (checks `code` on the error and on `error.cause`).
- `backend/server/cron/exclusiveCronTick.js` - per-job consecutive transient-failure counter, warn vs error.
- Tests: `tests/telegramBotConfig.spec.js` / a `sendLogsToTelegram` spec, `tests/loggerFunctions.spec.js`, `tests/prismaErrors.spec.js`, `tests/cronAdvisoryLock.spec.js`.
- `backend/AGENTS.md` Logging section (alert fields; transient cron downgrade); `backend/README.md` Telegram row if it lists alert fields.
- No env, no migration.

## Out of scope

- Downgrading transient errors on the request path (the global error handler keeps alerting on 5xx; the 60 s dedupe already bounds the flood) and in `/health` (already a warning).
- Sharing the consecutive-failure count across replicas - while the database is unreachable there is no shared store to keep it in (see design).
- Alert routing to different chats by severity.
