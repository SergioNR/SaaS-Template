# Design

## Context

`sendTelegramMessage(chatId, html)` (5 s timeout, never throws, no-op without the bot key) and `escapeHtml` (stringify, truncate to 1000 chars, escape `& < > "`) already exist. Writes that matter happen in: detached registration (`registerUserInBackground`), invite acceptance (transaction in the invite-accept model), the Stripe webhook sync (`syncSubscriptionWithCompanyLockInDb(companyId, resolver)` with the stored row in hand under the company lock), and `deleteUserAndCleanup` (result carries `companyDeleted`, `companyId`, `deletedUser`).

## Decisions

### One integration module, one function per event
`sendBusinessEventToTelegram(event, fields)` with a small per-event template map, mirroring the Wesel `line(label, value)` helper (empty values dropped). Call sites pass plain data, never `req`. The function is wrapped by callers in `trackBackground(...)`.

### Which fields (data minimisation)
| Event | Fields |
| --- | --- |
| `company.registered` | company name (or "unnamed"), trial end date |
| `subscription.started` | company name, plan + cycle, `converted from trial` or `resubscribed`, period end |
| `subscription.cancellation_scheduled` | company name, plan + cycle, access end date |
| `subscription.ended` | company name, plan + cycle, final Stripe status (`canceled`, `unpaid`, ...) |
| `team.invite.accepted` | company name, role name, new member count |
| `account.deleted` | actor kind (`self` / `team` / `admin`), company name (none for superadmins), remaining member count |
| `company.deleted` | company name, actor kind, whether it had a paid subscription |

No emails, user ids, company ids or Stripe ids. Company names are customer-chosen business names, needed for the message to mean anything; forks that consider them sensitive can drop the field in one place. Recommended default: no emails. Option for forks: an env flag `TELEGRAM_EVENTS_INCLUDE_EMAILS=1` - **not** part of this change (avoid PII creep by default).

### Detecting subscription transitions
The sync resolver already sees the stored row and the fresh Stripe subscription. Have the model return `{ previous, written }` and classify in a pure helper:
- `started`: written status grants access and previous row was a trial (`stripe_subscription_id` null) → "converted from trial"; previous row was an ended paid subscription or a different subscription → "resubscribed".
- `ended`: previous grants access, written status is in `ENDED_STATUSES`.
- `cancellation_scheduled`: `customer.subscription.updated` where the event's `previous_attributes` shows `cancel_at_period_end: false` (or `cancel_at: null`) and the fresh read now has it set. `previous_attributes` is only the trigger; the fresh read confirms. This avoids a new stored column.
Skipped or stale writes emit nothing. The plan name/cycle comes from the subscription's price id via a reverse lookup of `config/planPrices.js` (fallback: checkout metadata; else "unknown plan").

### Failure handling
The integration swallows everything; a non-OK response or exception logs `logWarn('Business event delivery failed', ...)`. Never `logError`: a Telegram outage must not turn every signup into an error alert.

## Risks / Trade-offs

- [Telegram group rate limit (~20 messages/min)] → business events are low-volume; a bulk import could hit it and lose messages (logged as warnings). Acceptable.
- [Webhook retries post twice] → accepted (no dedupe requested).
- [Price ids shared by several plans via the `STRIPE_PRICE_ID` fallback] → reverse lookup is ambiguous; use checkout metadata when available, else print the price-derived "unknown plan".

## Open questions for the implementer

- Should `company.registered` include the registrant's email domain (not the address) for B2B qualification? Recommended: no by default.
- Emit `account.deleted` for superadmin self-deletion? Recommended: yes, as "platform admin account deleted" with no other fields.
- Message language: the alert channel is English; keep events English too unless the product owner asks otherwise.

## Decisions taken at implementation

- No email domain on `company.registered` (no PII creep by default).
- A superadmin deletion emits `account.deleted` as a bare "Platform admin account deleted" message with no other field.
- Messages are English.
- The integration (`sendBusinessEventsToTelegram.js`) only formats and sends; the display reads (company name, member count, trial end) live in `utils/businessEvents.js` notifiers, which return early without any database read when the channel is off.
- A deleted company's name is read inside the deletion transaction (`companyName` on the model's result); the non-last-member result carries `remainingMemberCount`.
- `syncSubscriptionWithCompanyLockInDb` now resolves to `{ previous, written }` or `null` (was `true`/`false`). A same-subscription row without a stored `stripe_status` (synced before that column existed) counts as access-granting while `expires_at` is in the future, so legacy renewals do not look like new starts. A company with no subscription row at all starts as "converted from trial".
- Plan + cycle come from a reverse lookup of the subscription's first item price id (`getPlanForStripePriceId`); an ambiguous or unknown price prints "unknown plan". Checkout metadata is not consulted (it lives on the session, not the subscription).
