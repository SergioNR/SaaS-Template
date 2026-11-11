# Tasks

## 1. Subscription error model

- [x] 1.1 In `frontend/src/contexts/SubscriptionContext.jsx`, expose a machine-readable error kind (`'membership' | 'load' | null`) alongside the translated `error`, so pages can decide whether to offer retry; keep `refresh({ silent: true })` untouched; verify with a provider spec (404 → no error, 403 `COMPANY_MEMBERSHIP_REQUIRED` → membership, 5xx/network → load)

## 2. Dashboard error state

- [x] 2.1 (the activity timeline's subscription item also shows the unknown state) In `frontend/src/pages/user/UserDashboard.jsx`, when `error` is set render the subscription-status, days-remaining, plan and renewal cards in an unknown state (no inactive badge, no view-plans CTA) and hide the bottom choose-a-plan note (`!loading && !error && !hasActiveSubscription`)
- [x] 2.2 Render one inline `Alert` at the top of the dashboard on load error with a retry button calling `refresh()`; membership errors show the message without retry; add i18n keys to `es.json`
- [x] 2.3 Add `UserDashboard.test.jsx`: 5xx → error alert + retry, no inactive badge, no choose-a-plan note, no banner; retry → skeletons then data; 404 → inactive + banner + note (unchanged); 403 membership → message, no retry

## 3. Billing page retry

- [x] 3.1 In `frontend/src/pages/user/UserBilling.jsx`, add a retry button to the generic load-error alert (not to the membership error); verify with `UserBilling.test.jsx` (5xx → retry re-fetches; 403 membership → no retry)

## 4. Verification

- [x] 4.1 `npm run lint`, `npm test` and `npm run build` in `frontend/` pass
- [ ] 4.2 (manual browser check - not run by the implementing agent; covered by `UserDashboard.test.jsx`) Manual: stop the backend while on `/dashboard` and reload the area → error alert with retry, no "inactive"/"choose a plan"; start the backend and retry → real status
- [x] 4.3 `npx -y @fission-ai/openspec@1.16.0 validate show-billing-load-errors --strict` passes
