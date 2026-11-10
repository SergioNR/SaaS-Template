# Tasks

## 1. Consent control in the private areas

- [x] 1.1 `frontend/src/components/partials/AreaShell.jsx`: when `analyticsEnabled`, render a subtle button labelled `t('consent.manage')` at the bottom of the navbar, above logout, calling `resetAnalyticsConsent()`; closes the mobile sidebar like the links do
- [x] 1.2 `components/partials/AreaShell.test.jsx`: control renders with analytics configured (mock `analytics/posthog.js` exports), is absent without it, and a click calls `resetAnalyticsConsent`

## 2. Identify superadmins

- [x] 2.1 `frontend/src/pages/admin/AdminDashboardWrapper.jsx`: `useEffect` calling `identifyUser(sessionUser.id)` when `sessionUser?.id` is set
- [x] 2.2 `pages/wrapperGuards.test.jsx`: a successful admin session check calls `identifyUser` with the admin's id; a redirect (non-superadmin) does not

## 3. Verification

- [x] 3.1 `npm run lint`, `npm test` in `frontend/` pass
- [x] 3.2 Manual with a PostHog test key: accept the banner, sign in as a superadmin → PostHog person is the admin id; press the sidebar control → banner reappears and no further events are captured — not run by the implementing agent (needs a PostHog test key and a running stack); covered by `AreaShell.test.jsx` and `wrapperGuards.test.jsx`, to be confirmed by a reviewer
- [x] 3.3 `npx -y @fission-ai/openspec@1.16.0 validate consent-controls-everywhere --strict` passes
