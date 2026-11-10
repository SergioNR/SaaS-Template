# Design

## Context

express-rate-limit 8 / express-slow-down 3 accept any object implementing the `Store` interface (`init`, `increment(key) → { totalHits, resetTime }`, `decrement`, `resetKey`, optional `get`). `skipSuccessfulRequests` uses `decrement` after the response. The API already depends on PostgreSQL via Prisma and runs scheduled jobs under advisory locks; no Redis exists in `compose.yaml`.

## Decisions

### Which shared store
Options:
1. **Custom Prisma-backed store (recommended).** Table `RateLimitHit(key text PK, hits int, reset_at timestamptz)`; `increment` is one atomic `INSERT ... ON CONFLICT (key) DO UPDATE SET hits = CASE WHEN reset_at <= now() THEN 1 ELSE hits + 1 END, reset_at = CASE WHEN reset_at <= now() THEN now() + window ELSE reset_at END RETURNING hits, reset_at` via `$queryRaw`; `decrement`/`resetKey` are single statements. Schema owned by Prisma migrations (AGENTS: never change the schema without a migration), no new dependency, no new service. ~1 write per credential request.
2. **`rate-limit-postgresql` package.** Ready-made, but manages its own schema/tables outside Prisma migrations and opens its own `pg` pool next to Prisma's - two migration systems and two pools to size.
3. **Redis (`rate-limit-redis`).** The standard answer at scale and cheapest per request, but adds a stateful service to both compose stacks, backups/monitoring and a new failure mode for a template that otherwise needs only Postgres.

### Which limiters share state
Credential-path limiters only (auth budget, per-account login, reset email, password change): low volume, high security value. The global limiter and slow-down would turn every API request into a database write; keep them in memory unless a fork opts in (open question). Webhooks stay in memory (Stripe is the only legitimate caller).

### Failure mode
`passOnStoreError: true` (fail open) + `logWarn`. Failing closed would turn a store outage into a total login outage; the per-process global limiter still bounds abuse during it.

### Password-change budget key and counting
Key `pwchange:<userId>` (the session identifies the account; IP is irrelevant to a stolen-cookie attacker). Count only failed current-password checks: a custom `requestWasSuccessful` that treats anything except a 400 with `code: AUTH_CURRENT_PASSWORD_INCORRECT` as success, combined with `skipSuccessfulRequests: true`.

### Expired rows
Purge rows with `reset_at < now() - 1 day` from a lock-guarded scheduled job (daily), or opportunistically; recommended: scheduled job, consistent with the other cleanups.

## Risks / Trade-offs

- [Extra DB write per credential request] → negligible next to the bcrypt cost of the same requests.
- [Clock skew between replicas] → `now()` is taken from the database in the upsert, not from the app.

## Open questions for the implementer

- Offer `RATE_LIMIT_STORE_SCOPE=all` to put the global limiter and slow-down on the shared store too? Recommended: not now.
- Should the password-change limiter also key by IP to slow distributed guessing against many accounts from one IP? Recommended: no - the global per-IP limiter covers that.
