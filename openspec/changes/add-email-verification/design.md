# Design

## Context

Registration runs detached after an immediate 201 (enumeration safety); an existing address only gets an existing-account notice. Reset and invite tokens use `utils/secureToken.js` (`generateSecureToken`, `hashSecureToken`, `SECURE_TOKEN_PATTERN`), store digests only and are purged by lock-guarded cron jobs. Invite acceptance runs in a transaction serialized with the company's membership changes and answers 409 when the email already has an account.

## Decisions

### Gating policy for unverified accounts
Options:
1. **Block login (recommended).** Correct credentials → 403 `EMAIL_NOT_VERIFIED`, no session. Simple to reason about: an unverified account can do nothing, so a squatter gains nothing and the account is safe to delete or claim. Password is checked first, so the 403 reveals nothing an attacker without the password could learn.
2. Limited mode (login allowed, everything except the profile and a "verify" banner gated). Smoother onboarding, but every router needs a new gate, invites/billing/files must all re-check it, and the squatter keeps a working session on the victim's address.
3. Grace period (full access for N days). Defeats the squatting fix during the window.

### Claiming an unverified account
- **Password reset**: completion already proves mailbox control and replaces the password and all sessions; additionally set `email_verified_at = now()` in the same transaction. The real owner inherits a company named by the squatter - acceptable (they can rename it; the squatter never had access).
- **Invite acceptance**: inside the acceptance transaction, if the address belongs to an unverified account, delete it with `deleteUserWithCompanyDataInDb` semantics (it is always the sole member of its own company, because it could never log in to invite anyone), then create the member as today. Post-commit cleanup (Stripe/storage) is effectively a no-op but runs through the usual helper. Verified accounts → 409 unchanged.
- **Registration for an address with an unverified account**: unchanged response; the detached work sends the existing-account notice (whose copy should mention "forgot password" to claim it). Do **not** resend a verification email here - that would let the squatter's password become valid once the victim clicks.

### Endpoints and token transport
`POST` with the token in the JSON body (the SPA page reads it from the query once, then posts), never `GET` - mail scanners prefetch links and would consume a GET token. Unknown, expired or used tokens all answer 400 `EMAIL_VERIFICATION_INVALID` (no 404/400 split: nothing useful to distinguish for the user).

### Budgets
Verify endpoint: shared credential budget (10 / 15 min / IP). Resend: own per-IP budget of 5 per hour (mirrors the reset email budget). The per-account login limiter counts the 403 as a failed attempt (status >= 400) - acceptable, it only matters for someone retrying without verifying.

### Purge
Unverified accounts older than 7 days are deleted with their company (daily, 03:30, lock-guarded) so squatted addresses free themselves even if nobody claims them. Expired verification tokens are purged in the same job.

### Existing users
Backfill `email_verified_at = created_at` in the migration so the rollout never locks anyone out.

## Risks / Trade-offs

- [Users who never receive the email (spam folders) cannot log in] → resend endpoint + login-page resend action; password reset also verifies.
- [Brevo outage at registration] → token is stored; resend works once Brevo recovers.

## Open questions for the implementer

- Token lifetime: 24 h recommended; purge window for unverified accounts: 7 days recommended (must exceed the token lifetime).
- Should verification log the user in? Recommended: no - consistent with registration and invite acceptance; the page links to login.
- Show "unverified" in admin user lists? Recommended as a follow-up change.
