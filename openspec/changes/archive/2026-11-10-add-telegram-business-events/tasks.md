# Tasks

## 1. Integration

- [x] 1.1 Create `backend/server/integrations/telegram/sendBusinessEventsToTelegram.js`: reads `TELEGRAM_EVENTS_CHAT_ID`, no-op when unset, one template per event from the design table, every value through `escapeHtml`, empty lines dropped, never throws, `logWarn` on failure; verify `tests/sendBusinessEventsToTelegram.spec.js` (no-op without chat id → no `fetch`; markup in a company name is escaped; no email/uuid appears in any rendered message; a rejected send logs a warning, not an error)

## 2. Call sites

- [x] 2.1 `registerUserInBackground` (`controllers/authController.js`): after `createUserInDb` resolves, `trackBackground(sendBusinessEvent('company.registered', ...))`; nothing for the existing-account path or the P2002 race; verify `authController.spec.js`
- [x] 2.2 Invite acceptance (`acceptTeamInvite`): after the transaction commits with a created user, emit `team.invite.accepted` (company name, role, member count); nothing on 4xx outcomes; verify `inviteAcceptController.spec.js`
- [x] 2.3 Stripe sync: make `syncSubscriptionWithCompanyLockInDb` return `{ previous, written }` (or null when skipped); add a pure `classifySubscriptionTransition(previous, written, event)` and emit after the sync resolves; verify `stripeEventHandler.spec.js` for trial→active (converted), ended→active (resubscribed), active→canceled (ended), `cancel_at_period_end` false→true (cancellation scheduled), skipped/stale write (nothing)
- [x] 2.4 Deletions: emit `account.deleted` (actor kind from the caller: self/team/admin) and, when `companyDeleted`, `company.deleted`, after `deleteUserAndCleanup` returns `deleted`; verify `userDeletionCleanup.spec.js` / controller specs (no event on 404/409)
- [x] 2.5 Confirm every call site wraps the send in `trackBackground` and runs after the response-relevant write; verify by reading each diff and with a spec that a hanging send does not delay the response

## 3. Configuration docs

- [x] 3.1 Add `TELEGRAM_EVENTS_CHAT_ID=` with a `#*` comment to `backend/.env.example`; add a row to the `backend/README.md` env table (optional; requires `TELEGRAM_BOT_API_KEY`; events listed; no emails); verify the README row sits next to the existing Telegram row
- [x] 3.2 `backend/AGENTS.md`: business events go only through `sendBusinessEventsToTelegram.js`, after commit, fire-and-forget via `trackBackground`, no PII beyond the design table, failures warn

## 4. Validation

- [x] 4.1 Manual check with a test bot + chat: register, accept an invite, run a Stripe test-mode checkout and cancel it (`stripe trigger` or the portal), delete the account → one message each, no emails in any message — not run by hand (no test bot, Stripe test mode or database in the implementing environment); message shapes and the no-PII rule are pinned in `tests/sendBusinessEventsToTelegram.spec.js`, call sites in the controller / webhook / deletion specs
- [x] 4.2 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 4.3 `npx -y @fission-ai/openspec@1.16.0 validate add-telegram-business-events --strict` passes
