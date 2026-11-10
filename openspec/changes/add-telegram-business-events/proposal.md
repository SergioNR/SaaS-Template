# Proposal

## Why

The only push signal the API sends today is the Telegram **error** channel. Business-relevant moments - a company signs up, a trial converts, a subscription is cancelled or ends, a teammate joins, a company leaves - are visible only by querying the database or grepping audit lines in Better Stack. For a small SaaS team a low-noise "what happened today" chat is the cheapest growth and churn monitor there is, and the pattern already exists in a sibling product (`Wesel/backend/server/integrations/telegram/sendRequestsToTelegram.js`: optional chat id, `escapeHtml` on every line, fire-and-forget, never throws).

## What Changes

- New **optional** env var `TELEGRAM_EVENTS_CHAT_ID`. When it and `TELEGRAM_BOT_API_KEY` are set, the API posts one HTML message per business event to that chat; otherwise every event send is a no-op (no network call).
- Events: company registered (self-registration created a company), subscription started (distinguishing a converted trial from a resubscription), subscription cancellation scheduled, subscription ended, team invite accepted, account deleted (self, team removal or admin) and company deleted (last member left).
- Messages carry the minimum to be useful: event kind, company name, plan and billing cycle, relevant dates, role names, actor kind and member counts. **No email addresses, no Stripe ids, no user ids** by default (see design).
- Every interpolated value is HTML-escaped and truncated with the existing `escapeHtml`.
- Sends are fire-and-forget, tracked with `trackBackground` (so a graceful shutdown waits for them), run strictly **after** the triggering write committed, never change a response, and on failure only log a warning (never an error, so the events channel can never page the errors channel). No dedupe.
- Enumeration safety is preserved: the registration event fires from the detached registration work only when an account was actually created; nothing is sent for an already-registered email.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `observability`: ADDED requirements for the optional business-events channel, its event catalogue, its data minimisation and its isolation from request handling.

## Impact

- New `backend/server/integrations/telegram/sendBusinessEventsToTelegram.js` (reuses `sendTelegramMessage`, `escapeHtml`).
- Call sites (after commit, fire-and-forget): `controllers/authController.js` (`registerUserInBackground`, `acceptTeamInvite`), `webhooks/stripe/stripeEventHandler.js` (transition after `syncSubscriptionWithCompanyLockInDb`), `utils/userDeletionCleanup.js` or the three deletion controllers (`userController.deleteUser`, `teamController.removeTeamMember`, `adminController.deleteOneUserById`).
- `models/subscriptionModel.js` - the sync must return the previous and written state so the handler can classify the transition.
- Env: `TELEGRAM_EVENTS_CHAT_ID` in `backend/.env.example` and the `backend/README.md` env table (root `.env.example` inherits it by the documented append step).
- Tests: new `tests/sendBusinessEventsToTelegram.spec.js`; additions to `authController.spec.js`, `inviteAcceptController.spec.js`, `stripeEventHandler.spec.js`, `userDeletionCleanup.spec.js`.
- `backend/AGENTS.md` Logging / integrations section.
- No migration, no route change.

## Out of scope

- Email or Slack delivery of events, digests, or per-event toggles.
- Login, logout, password and role-change events (too noisy / security-sensitive for a business chat; the audit trail covers them).
- Dedupe of Stripe webhook retries (a retried delivery may post twice; accepted).
- Frontend changes.
