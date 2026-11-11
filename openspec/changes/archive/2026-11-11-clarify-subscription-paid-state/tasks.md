# Tasks

## 1. Shared definition

- [x] 1.1 Add `storedSubscriptionStatus(row, now = new Date())` → `'paid' | 'trial' | 'inactive'` to `backend/server/config/stripeSubscriptionStatuses.js`, built on `isStoredSubscriptionActive`; verify unit cases: Stripe-backed future → paid, Stripe-backed past → inactive, trial future → trial, trial past → inactive, null `expires_at` → inactive

## 2. Billing payload

- [x] 2.1 `getSubscriptionPublicDataInDb` (`backend/server/models/subscriptionModel.js`) returns `status` and `is_paid: status === 'paid'`; verify `subscriptionModel.spec.js` (ended paid row → `is_paid: false`, `status: 'inactive'`)
- [x] 2.2 Update the OpenAPI schema for `GET /api/v1/billing` in `routes/billingRouter.js`; verify `tests/openapiCoverage.spec.js`

## 3. Admin payloads and stats

- [x] 3.1 `countActiveSubscriptionsInDb` counts only Stripe-backed unexpired rows; add `countActiveTrialsInDb`; `getAdminStats` returns `activeTrials`; verify `adminController.spec.js` / `adminModels.spec.js`
- [x] 3.2 `getUserDetailInDb` (`models/userModel.js`): select `stripe_subscription_id` internally, drop `id`, return `{ created_at, updated_at, expires_at, status, is_paid }`; verify a spec asserts no `id` and no `stripe_subscription_id` in the result
- [x] 3.3 Company list and detail (`models/companyModel.js`): same subscription shape; fix the stale comment at `companyModel.js:4`; verify `adminModels.spec.js`
- [x] 3.4 (shared `PublicSubscription` schema referenced by billing, user detail and company detail; the company LIST item schema stays a bare object to avoid colliding with `filterable-admin-lists`, which owns that block) Update OpenAPI blocks under `routes/admin/` for the new fields; verify `openapiCoverage.spec.js`

## 4. Frontend follow-up

- [x] 4.1 `frontend/src/utils/subscriptionStatus.js`: prefer `subscription.status` when present, keep the date-based fallback; verify its unit tests (status present → returned as is; absent → current behaviour)
- [x] 4.2 (badge shows "De pago" vs "Prueba gratuita"; overview card label "Suscripciones de pago activas" with active trials in its detail line) `SubscriptionStatusBadge.jsx` and admin pages (`AdminUserDetail.jsx`, `AdminCompanyDetail.jsx`, company list) show paid vs trial badges; admin overview shows `activeTrials`; i18n keys added; verify `npm test`, `npm run lint`, `npm run build` in `frontend/`
- [x] 4.3 (`SubscriptionContext` derives `hasPaidSubscription`/`isTrial` through `subscriptionStatus`, which now prefers the server `status`; `UserBilling` already reads those flags) `UserBilling.jsx` / `SubscriptionContext.jsx`: derive the page state from `status`; verify the billing page tests

## 5. Docs and validation

- [x] 5.1 `backend/AGENTS.md` subscription-rows bullet: `status` vocabulary and `is_paid` meaning; `frontend/AGENTS.md` if it documents the badge fallback
- [x] 5.2 Commit as `feat(billing)!` with a BREAKING CHANGE footer about `is_paid`
- [x] 5.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 5.4 `npx -y @fission-ai/openspec@1.16.0 validate clarify-subscription-paid-state --strict` passes
