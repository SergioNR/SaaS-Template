# Proposal

## Why

When `GET /api/v1/billing` fails (network error, 5xx), the user dashboard renders exactly as if the company had no subscription: the subscription card shows the inactive badge, the plan card offers to view plans and the bottom note invites the user to choose a plan (`frontend/src/pages/user/UserDashboard.jsx:158-161,380` — every branch keys off `hasActiveSubscription`, which is false on error). Meanwhile the no-subscription banner correctly hides on error (`components/partials/NoActiveSubscriptionBanner.jsx:11`), so the page contradicts itself and nudges a paying customer to buy again. The billing page shows an error alert but offers no way to retry short of a full reload (`pages/user/UserBilling.jsx:180-184`).

## What Changes

- When the subscription fails to load, the dashboard's subscription-derived cards (subscription status, days remaining, plan card, renewal indicator) show an unknown/error state instead of "inactive", and the bottom choose-a-plan note is hidden (it already is for the banner).
- The dashboard shows one inline error alert with a retry action that re-runs the subscription fetch (non-silent: skeletons while retrying). A `COMPANY_MEMBERSHIP_REQUIRED` failure shows the membership message without retry.
- The billing page's generic load error gains the same retry action; the membership error stays without retry.
- No API change; `SubscriptionContext.refresh()` already exists and is reused.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `app-shell`: the dashboard summary requirement gains a load-failure state with retry; the no-subscription prompt requirement also hides the bottom note on failure.
- `billing`: the billing page status requirement gains a retry on generic load failures.

## Impact

- `frontend/src/pages/user/UserDashboard.jsx` — error branch in the subscription-derived cards, error alert with retry, bottom note guarded by `!error`.
- `frontend/src/pages/user/UserBilling.jsx` — retry button on the generic error alert.
- `frontend/src/contexts/SubscriptionContext.jsx` — may need to expose whether the error is retryable (membership vs. generic) instead of only a translated string.
- `frontend/src/i18n/locales/es.json` — copy for the unknown status and the retry action (reuse `common.*` keys where they exist).
- New specs: `UserDashboard.test.jsx`, `UserBilling.test.jsx` (mock `apiClient`).

## Out of scope

- Background (silent) refresh behaviour — it already keeps the last good data on failure.
- Changes to how paid/trial/inactive are derived (owned by `clarify-subscription-paid-state`, backend).
- Showing billing errors in other pages of the user area.
