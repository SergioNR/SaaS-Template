# Proposal

## Why

Two gaps let per-session client data outlive the session it belongs to:

- **Area wrappers redirect on 401 without clearing caches.** `UserWrapper` and `AdminDashboardWrapper` probe `GET /api/v1/auth/session`; that path is excluded from the axios 401 interceptor (it sits under `/api/v1/auth/`), so the interceptor's `invalidateSessionCaches()` never runs. The wrappers then `navigate()` to login client-side (`frontend/src/pages/user/UserWrapper.jsx:65`, `pages/admin/AdminDashboardWrapper.jsx:50`) — no reload, so module-level caches (company permissions) survive into whatever session signs in next on that tab. The `app-shell` spec already requires invalidation "when a 401 ends the session"; the code does not honour it on this path.
- **The interceptor's auth-page exemption misses the bare `/auth` route.** `handleUnauthorized` skips the redirect when `window.location.pathname.startsWith('/auth/')` (`config/API/axiosConfig.js:30`), but the login page is also served at `/auth` (see "The route tree separates public, auth, user and admin areas"). A non-auth request answering 401 while the visitor is on `/auth` triggers a full reload into `/auth/login?next=%2Fauth` — a pointless redirect loop step and a `next` pointing at an auth page.

## What Changes

- Both wrappers call `invalidateSessionCaches()` before navigating to login on a 401 session probe.
- The interceptor treats the visitor as on an auth page when the pathname is exactly `/auth` or starts with `/auth/`, via one shared `isAuthPath()` helper extracted from the rule `safeNextPath()` already applies inline (`utils/safeNext.js:27`), so both checks cannot drift again.
- Specs cover both paths.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `app-shell`: "Per-session cached data is invalidated on every session change" gains an explicit session-probe scenario; "An expired session anywhere returns the user to login" defines the auth pages as `/auth` and everything under it.

## Impact

- `frontend/src/pages/user/UserWrapper.jsx`, `frontend/src/pages/admin/AdminDashboardWrapper.jsx` — one call each.
- `frontend/src/config/API/axiosConfig.js` — exemption check; possibly a small `isAuthPath(pathname)` helper in `src/utils/safeNext.js`.
- Specs: `pages/wrapperGuards.test.jsx` (cache reset on 401), `config/API/axiosConfig.test.js` (bare `/auth`), `utils/safeNext.test.js` if the helper lands there.
- No API change.

## Out of scope

- Making the session probe itself go through the interceptor — the wrappers deliberately own their 401 handling (retryable non-401 errors).
- Any change to which caches register with `registerSessionCache()`.
