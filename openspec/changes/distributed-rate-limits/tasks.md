# Tasks

## 1. Shared store

- [ ] 1.1 Add `RateLimitHit` (`key` PK, `hits`, `reset_at`, index on `reset_at`) to `backend/prisma/schema.prisma` and create the migration; verify `npx prisma migrate deploy` on a fresh local database
- [ ] 1.2 `backend/server/models/rateLimitModel.js`: atomic `incrementRateLimitHitInDb(key, windowMs)`, `decrement...`, `reset...`, `deleteExpiredRateLimitHitsInDb`; verify specs with mocked `$queryRaw` (SQL uses database `now()`)
- [ ] 1.3 `backend/server/config/rateLimitStore.js`: `createRateLimitStore(prefix)` returns the Prisma store when `RATE_LIMIT_STORE=postgres`, `undefined` (memory) otherwise; unknown values fail the boot outside localhost and warn on localhost; verify `tests/requiredEnv.spec.js`-style spec
- [ ] 1.4 Wire `store` + `passOnStoreError: true` into `authLimiter`, `loginAccountLimiter`, `passwordResetLimiter`; store errors log a warning; verify limiter specs with a store mock that throws (request passes, warning logged)
- [ ] 1.5 Add a daily lock-guarded purge job for expired rows (new `ADVISORY_LOCK_KEYS` entry, registered in `cron/jobsContainer.js`); verify `tests/cleanupSchedulers.spec.js`

## 2. Password-change budget

- [ ] 2.1 New `backend/server/middlewares/passwordChangeRateLimiter.js` (5 per 15 min, key `pwchange:<userId>`, counts only 400 `AUTH_CURRENT_PASSWORD_INCORRECT`, shared store when enabled, 429 JSON `message`, `logRateLimited`); mount after `sanitizerResult` on `PATCH /api/v1/user/password` (and the alias if still present); verify `appIntegration.spec.js`: 5 wrong current passwords → 400s, 6th → 429 even with the right password; `AUTH_PASSWORD_UNCHANGED` and 422 do not count
- [ ] 2.2 Frontend: `PasswordUpdateForm` shows a too-many-attempts message on 429 (i18n key); verify its test and `npm test` in `frontend/`

## 3. Docs and validation

- [ ] 3.1 Add `RATE_LIMIT_STORE=` (with `#*` comment) to `backend/.env.example` and a row to the `backend/README.md` env table (default `memory`; `postgres` for multi-replica deployments; which limiters it affects)
- [ ] 3.2 `backend/AGENTS.md` rate-limit section: shared store scope, fail-open rule, password-change budget
- [ ] 3.3 Manual check: two local API processes with `RATE_LIMIT_STORE=postgres` behind alternating requests - the 11th auth request across both answers 429
- [ ] 3.4 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [ ] 3.5 `npx -y @fission-ai/openspec@1.16.0 validate distributed-rate-limits --strict` passes
