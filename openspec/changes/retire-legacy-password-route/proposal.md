# Proposal

## Why

`PATCH /api/v1/auth/update-user-password` is a deprecated alias of `PATCH /api/v1/user/password` (`backend/server/API/v1/routes/authRouter.js:404-406`: "remove once every client calls the user route"), yet the template's own SPA still calls the alias (`frontend/src/components/auth/PasswordUpdateForm.jsx:38`). Because the alias lives under `/api/v1/auth`, the SPA's global 401 session-expiry redirect skips it, so `PasswordUpdateForm` carries its own 401 handling (`PasswordUpdateForm.jsx:44-48`) to compensate. Two routes, two OpenAPI entries, one special case in the client - for no remaining consumer once the SPA switches.

## What Changes

- The SPA calls `PATCH /api/v1/user/password`; its local 401 workaround is removed in favour of the global session-expiry handling (the outcome - reset caches, go to login with a safe `next` - is unchanged).
- **BREAKING:** `PATCH /api/v1/auth/update-user-password` is removed. Requests to it answer like any unknown auth path (see `fix-auth-registration-gaps`: 404; until that lands, 401 without a session and 404 with one).
- Ship as two commits in one PR (or two PRs): frontend switch first, then `feat(auth)!: remove deprecated update-user-password alias`, so a rollback of the backend alone never breaks the SPA.
- No env vars, no migration.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `account`: the deprecated alias requirement is REMOVED.
- `auth`: the list of authenticated auth routes no longer includes the alias.

## Impact

- `frontend/src/components/auth/PasswordUpdateForm.jsx` (+ its test) - new URL, drop the local 401 branch if the global handler covers `/api/v1/user`.
- `backend/server/API/v1/routes/authRouter.js` - delete the alias route and its OpenAPI block; drop now-unused imports.
- `backend/server/API/v1/routes/userRouter.js`, `controllers/userController.js` - remove comments mentioning the alias.
- Tests: `tests/appIntegration.spec.js` / `tests/userController.spec.js` / `tests/openapiCoverage.spec.js` (alias gone, canonical route unchanged).
- Docs: `backend/README.md`, `backend/AGENTS.md` mention the alias - update. After archive, the `account` spec Purpose line still mentions the alias; edit it as part of the archive commit.
- **Coordination:** `fix-auth-registration-gaps` also MODIFIES `auth` "Authenticated auth routes require a session". Whichever archives second must rebase its MODIFIED block (final text: no alias in the list, unknown paths 404 with or without a session).
- External clients of forks still on the alias must move to `PATCH /api/v1/user/password` (same body, same responses).

## Out of scope

- Any change to the canonical route's inputs, outcomes or session revocation.
- Rate limiting of password changes (`distributed-rate-limits`).
