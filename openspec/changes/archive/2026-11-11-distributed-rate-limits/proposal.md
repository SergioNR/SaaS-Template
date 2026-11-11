# Proposal

## Why

Every limiter keeps its counters in the default express-rate-limit `MemoryStore` (`backend/server/middlewares/express-rate-limiter.js`, `express-slow-down.js`, `authRateLimiter.js`, `loginAccountRateLimiter.js`, `passwordResetRateLimiter.js`, `webhooks/webhookRateLimiter.js`; `express-rate-limiter.js:9` even carries the commented-out `// store: ...` placeholder). The deploy stacks are built for several replicas (advisory-locked cron, draining health probe), and behind a load balancer each replica counts separately: with N replicas an attacker gets N x 10 credential attempts, N x 5 failed logins per account and N x 5 reset emails per window, and a restart resets every budget. The spec states it openly ("Limiter state is per process").

Separately, the authenticated password change (`PATCH /api/v1/user/password`, and its alias while it exists) runs a bcrypt comparison of `currentPassword` with **no limiter at all** beyond the global 100 requests / 15 minutes. A stolen session cookie can therefore brute-force the account's current password (needed to lock the owner out by changing it) at ~100 guesses per 15 minutes per IP, unbounded across IPs.

## What Changes

- New optional env var `RATE_LIMIT_STORE` (`memory` default, or `postgres`). With `postgres`, the **credential-path limiters** (shared auth budget, per-account login, password-reset email, new password-change budget) use a shared PostgreSQL-backed store, so budgets hold across replicas and restarts. The global limiter, slow-down and webhook limiter stay per process by default (high-volume, coarse) - see design.
- New **per-account password-change budget**: at most 5 failed current-password checks (`AUTH_CURRENT_PASSWORD_INCORRECT`) per 15 minutes per user, answering 429 with a JSON `message`; successful changes and other rejections do not count. Active in every environment.
- Store errors fail **open** (the request proceeds, a warning is logged) so a database hiccup never locks everyone out of login - the login itself would fail anyway if the database is down.
- One migration (store table) when the Prisma-backed store is chosen.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `api-hardening`: per-account login budget no longer per process when the shared store is enabled; new shared-store requirement; new password-change budget.
- `account`: password-change throttling outcome.

## Impact

- New `backend/server/config/rateLimitStore.js` (store factory per limiter prefix) and, for the recommended option, `backend/server/models/rateLimitModel.js` + `RateLimitHit` model in `prisma/schema.prisma` + migration + an expired-row purge (scheduled job under the advisory-lock scheme, or `DELETE` on increment).
- Limiter middlewares above (pass `store`, `passOnStoreError: true`); new `middlewares/passwordChangeRateLimiter.js` mounted on `PATCH /api/v1/user/password` (and the alias, if still present) after validation.
- Env: `RATE_LIMIT_STORE` in `backend/.env.example` and the `backend/README.md` env table; `requiredEnv`/boot validation rejects unknown values.
- Tests: new store + limiter specs; `tests/appIntegration.spec.js` limiter wiring (password change 429 on the 6th wrong current password).
- `backend/AGENTS.md` rate-limit section.
- SPA follow-up: `PasswordUpdateForm` shows a too-many-attempts message on 429.

## Out of scope

- Redis or any new infrastructure service in the compose stacks (design option, not recommended now).
- Changing any existing budget value.
- Per-account limits on other authenticated endpoints.
