# Proposal

## Why

A full review after the 2026-11-10/11 batches (20 changes from three parallel implementers, merged by hand) found gaps at the seams between batches. In each, one batch's guarantee was skipped on a path the other batch added:

- **Business events.** The invite-acceptance claim deletes an unverified account and its company but posted no event. The nightly purge posted its deletions as "deleted by the member themselves". A failing verification email swallowed the company-registered event of a committed registration.
- **Purge alerting.** The unverified-account purge `logError`-ed every per-account failure, bypassing the cron job's warn-first rules for database outages and shutdowns: one Telegram alert per account during a blip.
- **Shared limits.** The verification-email resend was the only email budget not shared across replicas under `RATE_LIMIT_STORE=postgres`.
- **Stripe redirects.** Checkout and portal return URLs were string-concatenated onto `FRONT_WEB_APP_ORIGIN_URL`, so a trailing slash or path produced `//user/billing`. Emailed links already used origin-only joining.
- **SPA.**
  - `/user/profile` and `/user/billing` had no page heading for focus on navigation (an existing `app-shell` requirement).
  - 409 `CHECKOUT_IN_PROGRESS` showed "invalid data".
  - A paid subscription read "Activa" on user pages but "De pago" in admin.
  - A dead client-side date fallback for subscription state remained.
- **Docs.** `/auth/verify-email` was missing from the route-tree requirement, and AGENTS/README/env files had stale statements. The deploy checklist omitted variables the backend requires to boot, including the new `BREVO_VERIFY_EMAIL_TEMPLATE_ID`.

## What Changes

- Events for automatic deletions with a new `system` actor ("automatic cleanup"). The company-registered event is emitted before the verification email is issued.
- The purge rethrows transient database errors and any error after shutdown starts. `runExclusiveCronTick` then handles them once.
- `verificationEmailLimiter` uses the shared credential store options.
- `frontendUrl` moves to `server/utils/frontendUrl.js` and builds the Stripe success, cancel and portal return URLs.
- SPA:
  - h2 headings on profile and billing;
  - a `CHECKOUT_IN_PROGRESS` toast;
  - subscription state only from `status`, with one "Activa" label everywhere;
  - unused i18n keys removed;
  - the missing named exports added.
- Docs: backend and frontend AGENTS, the backend README (routes and limits), the env examples and deploy checklist, the seed comment.
- Also in the same PR, without spec impact:
  - `compose.build.yaml`, an overlay to build both images from the checkout;
  - `NGINX_CSP_CONNECT_EXTRA` / `NGINX_CSP_POSTHOG_ORIGINS` passed through both deploy stacks. Without the first, presigned S3 uploads were blocked by the CSP.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `observability`: business event catalogue covers automatic deletions and survives later failures.
- `api-hardening`: shared budgets include verification emails.
- `background-jobs`: purge failure handling.
- `billing`: return URLs on the origin; checkout-in-progress message; subscription state labels.
- `app-shell`: route tree lists email verification.

## Impact

- Backend:
  - `controllers/authController.js`
  - `cron/deleteUnverifiedAccountsScheduler.js`
  - `integrations/telegram/sendBusinessEventsToTelegram.js`
  - `middlewares/verificationEmailRateLimiter.js`
  - `integrations/stripe/*`
  - new `utils/frontendUrl.js` (re-exported from the Brevo module)
  - specs
- Frontend:
  - `pages/user/CustomerProfile.jsx`, `UserBilling.jsx`
  - `utils/subscriptionStatus.js`
  - `components/shared/SubscriptionStatusBadge.jsx`
  - `es.json`
  - named exports
  - specs
- Root: `compose*.yaml`, `.env.example`, README, AGENTS.
