# Tasks

## 1. Data model

- [x] 1.1 Add `email_verified_at DateTime?` to `User` and an `EmailVerificationTokens` model (mirrors `PasswordResetTokens`: `user_id` cascade, unique `token_hash`, `token_expires`, `created_at`, index on `user_id`) in `backend/prisma/schema.prisma`; migration backfills `email_verified_at = created_at` for existing rows; verify `npx prisma migrate deploy` on a database with existing users and check no user is left null
- [x] 1.2 `prisma/seed.js`: seeded accounts verified; verify `npx prisma db seed` locally (not run - no database available to the implementing agent)
- [x] 1.3 `models/emailVerificationTokensModel.js`: issue (deletes earlier tokens of the user), consume atomically (unexpired only, sets `email_verified_at` in the same transaction), purge expired; verify `tests/secureTokenModels.spec.js`-style specs

## 2. Registration and verification API

- [x] 2.1 Detached registration creates the account unverified, issues a token and sends `sendEmailVerificationToUser` (new Brevo integration, link built from the front-end origin to `/auth/verify-email?emailVerificationToken=`); existing-account path unchanged; verify `authController.spec.js`
- [x] 2.2 `POST /api/v1/auth/email-verification` (body-only schema, `SECURE_TOKEN_PATTERN`, `authLimiter`): 200 `{}` on success, 400 `EMAIL_VERIFICATION_INVALID` otherwise; audit `auth.email.verified`; verify controller spec + `appIntegration.spec.js`
- [x] 2.3 `POST /api/v1/auth/email-verification/resend` (body-only `email` schema, new `verificationEmailLimiter` 5/hour/IP): always 200 with a fixed message before any lookup; detached: re-issue and send only for an existing unverified account; audit `auth.email_verification.requested` without email or user id; verify timing-independent response in specs
- [x] 2.4 OpenAPI blocks for both routes; verify `tests/openapiCoverage.spec.js`

## 3. Gating and claims

- [x] 3.1 Login: after a successful password check, an unverified account answers 403 `{ code: "EMAIL_NOT_VERIFIED" }` and no session is created; wrong password still 401; verify `passportLocalStrategy.spec.js` / `authController.spec.js`
- [x] 3.2 Reset completion sets `email_verified_at` (if null) in the reset transaction; verify model spec
- [x] 3.3 Invite acceptance: unverified holder of the address is deleted with its company inside the acceptance transaction, then the member is created; verified holder → 409 unchanged; verify `inviteAcceptController.spec.js` and model specs (including the race with a concurrent verification → 409)
- [x] 3.4 Invite delivery (`deliverInviteInBackground`) skips the email only for verified accounts; verify `teamController.spec.js`

## 4. Scheduled purge

- [x] 4.1 `cron/deleteUnverifiedAccountsScheduler.js` (daily 03:30, new advisory lock key): deletes unverified accounts older than 7 days with their company data (via the shared deletion helper) and expired verification tokens; register in `jobsContainer.js`; verify `tests/cleanupSchedulers.spec.js`

## 5. Configuration

- [x] 5.1 `BREVO_VERIFY_EMAIL_TEMPLATE_ID` required via `requireEnv` in `brevo.js`; add to `backend/.env.example` and the `backend/README.md` env table (template params: `appOrigin`, `emailVerificationUrl`); verify `tests/requiredEnv.spec.js` (covered by `brevoTransactionalEmails.spec.js`, which loads the real `brevo.js` with the var set)
- [ ] 5.2 (manual, per environment - flagged in the PR) Create the Brevo template in each environment (manual)

## 6. Frontend

- [x] 6.1 `VerifyEmailPage.jsx` at `/auth/verify-email`: read the token once, strip the query (same helper as restore/invite pages), POST it, show success (link to login), invalid (with resend form) or retryable error; route in `main.jsx`; verify tests
- [x] 6.2 Registration page success copy tells the user to check their inbox; login page maps 403 `EMAIL_NOT_VERIFIED` to a message with a resend action calling the resend endpoint (429 → too-many-attempts); i18n keys; verify `npm test`, `npm run lint`, `npm run build` in `frontend/`

## 7. Docs and validation

- [x] 7.1 `backend/AGENTS.md`: verification token rules, login gating, claim rules, purge job; `frontend/AGENTS.md` auth page list if present
- [ ] 7.2 (manual, needs Brevo + database - flagged in the PR) Manual end-to-end with Brevo configured: register → email → verify → login; register squat → invite the address → accept succeeds; squat → reset → login succeeds
- [x] 7.3 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 7.4 `npx -y @fission-ai/openspec@1.16.0 validate add-email-verification --strict` passes
