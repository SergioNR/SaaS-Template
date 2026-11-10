# Proposal

## Why

Self-service registration never proves the registrant controls the address (`auth` spec: "SHALL NOT require email verification"). Anyone can register `victim@corp.com`, which:

- **squats the address**: the real owner's later registration only triggers the existing-account notice, and an invite to that address can never be accepted - `POST /api/v1/auth/invite-accept` answers **409** "already has an account" and invite delivery is skipped for registered addresses (`teamController.js` `deliverInviteInBackground`);
- lets the squatter **use the product under someone else's identity** (company name of their choice, trial, Stripe customer created with the victim's email);
- pollutes analytics, the Stripe customer list and any outgoing email with unproven addresses.

## What Changes

- Registered accounts start **unverified** (`email_verified_at` null) and receive a verification email with a single-use token (same 256-bit / SHA-256-digest pattern as reset and invite tokens, 24-hour expiry, newest token wins).
- New `POST /api/v1/auth/email-verification` (`{ emailVerificationToken }` in the body) marks the account verified; new enumeration-safe `POST /api/v1/auth/email-verification/resend` (`{ email }`) re-issues the email for unverified accounts, behind its own per-IP budget.
- **Login is blocked until verified** (recommended policy, see design): correct credentials of an unverified account answer **403** with `code: "EMAIL_NOT_VERIFIED"` and no session; wrong credentials still answer 401.
- **Mailbox proofs claim unverified accounts**: completing a password reset marks the account verified (it proves mailbox control and replaces the squatter's password); accepting an invite for an address held by an **unverified** account deletes that account (and its empty company) and creates the member in the same transaction. Verified accounts keep today's 409.
- Invite delivery is skipped only for **verified** accounts.
- A scheduled job purges unverified accounts (with their companies) 7 days after registration, and expired verification tokens daily.
- Migration: `User.email_verified_at` (existing users backfilled as verified at their `created_at`, so nobody is locked out) and an `EmailVerificationTokens` table. Seeded accounts are verified.
- New required Brevo template id `BREVO_VERIFY_EMAIL_TEMPLATE_ID` (link built by the API, as in `fix-auth-registration-gaps`).
- SPA: verification page `/auth/verify-email?emailVerificationToken=...`, registration success copy ("check your inbox"), login page handling of `EMAIL_NOT_VERIFIED` with a resend action.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `auth`: registration creates unverified accounts; login gating; verification and resend endpoints; reset and invite acceptance claim unverified accounts; SPA pages.
- `api-hardening`: verify endpoint joins the shared credential budget; new verification-email budget.
- `team-management`: invite delivery depends on a verified account.
- `background-jobs`: purge of unverified accounts and expired verification tokens.
- `observability`: enumeration-safe audit line for resend requests.

## Impact

- `backend/prisma/schema.prisma` + migration (column, table, backfill `UPDATE "User" SET email_verified_at = created_at`), `prisma/seed.js` (verified seed users).
- New `models/emailVerificationTokensModel.js`, `utils/validators/emailVerificationSchema.js`, `utils/validators/resendVerificationSchema.js`, `middlewares/verificationEmailRateLimiter.js`, `integrations/brevo/transactionalEmails/sendEmailVerificationToUser.js`, cron `deleteUnverifiedAccountsScheduler.js` (+ `ADVISORY_LOCK_KEYS`).
- `controllers/authController.js` (register detached work issues a token; verify; resend; login gating via `auth/strategies/passportLocalStrategy.js` or `loginLocal`; reset completion sets `email_verified_at`; invite acceptance claim), `models/userModel.js`, `models/teamInvitesModel.js`/invite-accept model, `controllers/teamController.js` (delivery check), `routes/authRouter.js` (+ OpenAPI).
- Env: `BREVO_VERIFY_EMAIL_TEMPLATE_ID` in `backend/.env.example`, `backend/README.md` env table, `brevo.js` `requireEnv`.
- Frontend: new `pages/auth/VerifyEmailPage.jsx` + route in `main.jsx`, `RegisterPage`, `LoginPage`, i18n catalog, tests.
- Tests: auth controller, strategy, invite accept, team controller, new model/limiter/cron specs, `appIntegration.spec.js`.
- Docs: `backend/AGENTS.md` (verification rules, token pattern), `frontend/AGENTS.md` if it lists auth pages.
- **Coordination:** written on top of `fix-auth-registration-gaps` (required `companyName`, code-built email links); apply that change first or rebase the MODIFIED "Self-service registration creates a company and its owner" block. `restrict-validator-field-locations` applies to the two new body schemas too (`in: ['body']`).

## Out of scope

- Changing the email address of an existing account (re-verification on change).
- Verification for superadmins created outside the seed (admin tooling).
- Showing verification state in the admin area (possible follow-up).
- Magic-link login.
