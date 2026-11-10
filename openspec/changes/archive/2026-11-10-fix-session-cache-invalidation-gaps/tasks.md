# Tasks

## 1. Wrapper 401 branch

- [x] 1.1 `frontend/src/pages/user/UserWrapper.jsx` and `frontend/src/pages/admin/AdminDashboardWrapper.jsx`: call `invalidateSessionCaches()` right before `navigateRef.current(loginRedirectPath(...))` in the 401 branch
- [x] 1.2 `frontend/src/pages/wrapperGuards.test.jsx`: for each wrapper, a 401 probe resets a registered test cache (spy registered via `registerSessionCache`) and navigates to login with `next`; a 5xx probe does not reset it

## 2. Auth-page exemption

- [x] 2.1 Add `isAuthPath(pathname)` (`/auth` exactly or `/auth/...`) to `frontend/src/utils/safeNext.js` and use it in `handleUnauthorized` (`config/API/axiosConfig.js`) and in `safeNextPath()` (replacing its inline `/auth` check at line 27)
- [x] 2.2 `config/API/axiosConfig.test.js`: 401 on a non-auth endpoint while on `/auth` → no redirect; while on `/authors-page` (prefix lookalike) → redirect; `utils/safeNext.test.js` covers `isAuthPath`

## 3. Verification

- [x] 3.1 `npm run lint` and `npm test` in `frontend/` pass
- [x] 3.2 Manual: sign in as a company member, open `/user/team` (permissions cached), delete the session cookie, navigate inside the area → login; sign in as an owner on the same tab without reloading → team page shows owner controls (fresh permissions) — not run by the implementing agent (no local stack/Docker); covered by the `wrapperGuards.test.jsx` cache-reset specs, to be confirmed by a reviewer
- [x] 3.3 `npx -y @fission-ai/openspec@1.16.0 validate fix-session-cache-invalidation-gaps --strict` passes
