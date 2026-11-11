# Proposal

## Why

"Paid", "active" and "trial" mean different things in different places:

- `GET /api/v1/billing` reports `is_paid: Boolean(stripe_subscription_id)` (`backend/server/models/subscriptionModel.js:178`), i.e. "**ever** backed by Stripe" - it stays `true` after a paid subscription ended. The spec codifies this ("Paid versus trial semantics"), and every client must combine `is_paid` with `expires_at` to know anything.
- Admin stats count `activeSubscriptions` as rows with `expires_at > now` (`subscriptionModel.js:189-199`), which **includes free trials**, while `backend/AGENTS.md` says "active paid subscription" is decided only by `isStoredSubscriptionActive` (`config/stripeSubscriptionStatuses.js`: Stripe-backed **and** unexpired). The overview number is therefore "paid + trialing", labelled as active subscriptions.
- Admin payloads (user detail, company list and detail) carry only subscription dates, so the SPA's `SubscriptionStatusBadge` cannot tell a trial from a paid plan and falls back to a generic `active` (`frontend/src/utils/subscriptionStatus.js`).
- The admin user detail exposes the subscription row's internal `id` (`backend/server/models/userModel.js:313-318`), unlike every other payload.
- `companyModel.js:4` says the row `id` "for paid rows is the Stripe subscription id" - stale since `stripe_subscription_id` was split out.

## What Changes

- Every subscription payload (billing status read, admin user detail, admin company list and detail) carries a server-computed **`status`**: `paid` (Stripe-backed and unexpired, i.e. `isStoredSubscriptionActive`), `trial` (no Stripe subscription, unexpired) or `inactive` (expired or no expiry). The values match the SPA's existing vocabulary.
- **`is_paid` is redefined** as `status === "paid"` ("currently on an active paid subscription") and added to the admin payloads. An ended paid subscription now reads `is_paid: false`. **BREAKING** for any client relying on the old "ever paid" meaning; the SPA does not (it already ANDs `is_paid` with a future `expires_at`).
- Admin stats: `activeSubscriptions` counts only paid, unexpired subscriptions; a new `activeTrials` counter counts unexpired trials.
- The admin user detail's subscription no longer exposes the row `id`.
- The stale comment in `companyModel.js` is corrected.
- No migration, no env vars, no new routes.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `billing`: status read gains `status`; paid-versus-trial semantics redefined; billing page derives its state from `status`.
- `admin`: stats counters, user detail, company list and company detail expose `status`/`is_paid` consistently and drop the subscription row id.

## Impact

- `backend/server/config/stripeSubscriptionStatuses.js` - add pure `storedSubscriptionStatus(row, now)` → `paid|trial|inactive` built on `isStoredSubscriptionActive`.
- `backend/server/models/subscriptionModel.js` - `getSubscriptionPublicDataInDb` returns `status` and the new `is_paid`; `countActiveSubscriptionsInDb` filters on `stripe_subscription_id: { not: null }`; new `countActiveTrialsInDb`.
- `backend/server/models/companyModel.js` / `userModel.js` - select `stripe_subscription_id` internally, map to `status` + `is_paid`, never return it or the row `id`; fix the comment at `companyModel.js:4`.
- `backend/server/controllers/adminController.js` - `activeTrials` in stats.
- OpenAPI blocks in `routes/billingRouter.js` and `routes/admin/*` (schemas for `status`, `is_paid`, `activeTrials`); `tests/openapiCoverage.spec.js`.
- Tests: `subscriptionModel.spec.js`, `adminModels.spec.js`, `adminController.spec.js`, `billingController.spec.js`.
- Frontend follow-up: `frontend/src/utils/subscriptionStatus.js` prefers `subscription.status` when present (keeps the date fallback), `SubscriptionStatusBadge.jsx` shows trial vs paid in admin lists/details, admin overview shows `activeTrials`; their tests.
- `backend/AGENTS.md` subscription-rows bullet (status vocabulary); `frontend/AGENTS.md` if it describes the badge fallback.

- **Coordination:** `filterable-admin-lists` also MODIFIES `admin` "Company list" and `show-billing-load-errors` also MODIFIES `billing` "Billing page status". Whichever change archives second must rebase its MODIFIED block on the archived text so neither edit is lost.

## Out of scope

- Distinguishing an expired trial from a churned paid customer (see design open question).
- Exposing Stripe status values (`past_due`, ...) to clients.
- Changing checkout guards or the webhook write rules (they already use `isStoredSubscriptionActive`).
