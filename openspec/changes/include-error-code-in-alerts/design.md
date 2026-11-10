# Design

## Context

`logError` serializes the error with `serializeError` (`name`, `message`, `code`, `status`, `stack`) and fires `sendErrorLogsToTelegram`, which builds the HTML alert and dedupes on `logMessage|name|message` for 60 s per process. Cron ticks go through `runExclusiveCronTick(jobName, lockKey, task)`, which catches everything and calls `logError('Error in cron job <name>:', error)`. During a database outage the failure happens before the task runs, inside `runWithAdvisoryLockInDb` (`prisma.$transaction` + `pg_try_advisory_xact_lock`).

## Decisions

### Error Code line + fallback, in the integration
The Telegram integration already receives the serialized error, so the change is local: add `<b>Error Code</b>` and compute details as `message` unless it is blank or matches `/^\s*Invalid `[^`]+` invocation:\s*$/`, in which case details = `code ?? 'N/A'`. pino lines are unchanged (they already carry `code`).

### Transient classification is a pure helper
`isTransientDatabaseError(error)` returns true when `error.code` or `error.cause?.code` is one of `P1001` (can't reach server), `P1017` (server closed connection), `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`. Kept in `utils/prismaErrors.js` beside `isPrismaErrorCode` so it is unit-testable and reusable later (for example by the health probe).

### Threshold N and where the state lives
Options:
1. **N = 3 consecutive ticks, in-memory per process, per job (recommended).** A `Map<jobName, count>` inside `exclusiveCronTick.js`; incremented on a transient failure, reset to 0 on success or skipped-lock (lock acquired by another replica means the database answered). At 3 the tick logs an error; later transient failures keep warning until a reset, so a long outage alerts once per job per process. For the 15-minute upload sweep this means an alert after ~30-45 minutes of outage; daily jobs alert only on the third consecutive daily failure, which is acceptable because the request path and `/health` surface an outage much sooner.
2. Time-based (alert when transient failures persist for >= 30 min since the first one). Fairer across job cadences, but daily jobs would then alert on the first failure after a 30-minute-old earlier failure that never existed - effectively immediately - which defeats the point; it also needs a clock injected into the spec.
3. Shared state in the database - impossible to rely on exactly when it matters (the database is the thing that is down).

With several replicas each process counts on its own; a long outage can therefore alert once per replica per job. Accepted: the per-process alert dedupe already has the same property.

### Severity, not silence
Downgraded ticks still log a warning with the job name, the error code and the consecutive count, so Better Stack shows the outage timeline without paging.

## Risks / Trade-offs

- [A real, persistent non-connectivity bug with a transient-looking code] → only five codes are classified; everything else alerts at once.
- [Counter never resets on a replica that stops winning the lock] → a skipped tick (lock held elsewhere) resets the count because it proves connectivity.

## Open questions for the implementer

- Include `P2024` (connection-pool timeout) and `P1008` (operation timed out)? Recommended: `P2024` yes if it shows up in practice during restarts; leave `P1008` out (it can be a slow query bug).
- Should N be configurable (`CRON_TRANSIENT_ALERT_THRESHOLD`)? Recommended: no - a constant with a `//*` rationale comment; add an env var only if a fork needs it (and then document it in `.env.example` + README).
