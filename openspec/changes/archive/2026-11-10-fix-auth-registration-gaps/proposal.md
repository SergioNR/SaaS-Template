# Proposal

## Why

Four small gaps between the API, the SPA and their docs in the registration and recovery flows:

1. **Reset-link path is undocumented and unverified.** The reset email's link is built inside the Brevo template. The code comment says the template links to `{{ params.appOrigin }}/auth/reset-password?token=...` (`backend/server/integrations/brevo/transactionalEmails/sendResetPasswordTokenToUser.js:20`), but the SPA serves `/auth/restore-password?passwordResetToken=...` (`frontend/src/main.jsx:97`, `RestorePasswordPage`). If the template follows the comment, every reset link lands on the SPA's 404; if it does not, the comment misleads every fork that recreates the template. Nothing in the repo tests the link, and `appOrigin` is the raw `FRONT_WEB_APP_ORIGIN_URL` (a trailing slash or path would produce `//auth/...`).
2. **`companyName` is optional on the API** (`createUserSchema.js` - "Optional so clients built before onboarding asked for it keep working") while the registration page requires it. Companies created through the API without a name show up unnamed in admin lists and in invite emails.
3. **Unknown `/api/v1/auth/*` paths answer 401 when unauthenticated.** `authRouter.use(checkAuthentication(), authPrivateRouter)` (`backend/server/API/v1/routes/authRouter.js:445`) gates everything that missed the public routes, so the fallback 404 (`authRouter.js:448-450`) is only reachable with a session. A typo in a public auth call (`/api/v1/auth/registr`) looks like an auth problem instead of a missing route, unlike every other router.
4. **`RestorePasswordPage` handles a 404 on submit** (`frontend/src/pages/auth/RestorePasswordPage.jsx:94`) that `PATCH /api/v1/auth/password-reset` never sends (unknown, expired and consumed tokens all answer 400). Dead branch, misleading to readers.

## What Changes

- The API builds the reset link itself - `<origin of FRONT_WEB_APP_ORIGIN_URL>/auth/restore-password?passwordResetToken=<token>` with the token URL-encoded - and passes it to the template as `resetPasswordUrl`; the invite email likewise gets `acceptInviteUrl` (`/auth/accept-invite?inviteToken=<token>`). Templates use these params; the raw tokens stay available for forks that still build links in Brevo during the transition. A unit test pins both URLs.
- **BREAKING (API):** `companyName` becomes required on `POST /api/v1/auth/register` (2-100 characters after trimming); a missing or empty name answers 422. Existing unnamed companies are untouched.
- Unknown paths under `/api/v1/auth` answer **404** with the route-not-found `message` whether or not the request has a session; known private routes still answer 401 without a session.
- Frontend cleanup: drop the unreachable 404 branch on the restore page's submit.
- No new env vars, no migration.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `auth`: registration requires a company name; unknown auth paths answer 404; new requirement that emailed links point at the SPA's token pages.

## Impact

- `backend/server/integrations/brevo/transactionalEmails/brevo.js` - helper `frontendUrl(path, params)` from `new URL(FRONT_WEB_APP_ORIGIN_URL).origin`.
- `sendResetPasswordTokenToUser.js`, `sendTeamInviteToUser.js` - pass `resetPasswordUrl` / `acceptInviteUrl`; fix comments.
- Brevo dashboard: update both templates to use the new params (manual, per environment).
- `backend/server/utils/validators/createUserSchema.js` - `companyName` required; `controllers/authController.js` / `models/userModel.js` - drop the unnamed-company branch for registration (column stays nullable for existing rows).
- `backend/server/API/v1/routes/authRouter.js` - gate only the private routes (route-level `checkAuthentication()` or a private sub-path), so the fallback is reachable unauthenticated; OpenAPI text for register (`companyName` required).
- Tests: `tests/brevoTransactionalEmails.spec.js`, `tests/validators.spec.js`, `tests/authController.spec.js`, `tests/appIntegration.spec.js` (unknown auth path → 404 without a session; `GET /api/v1/auth/session` → 401 without a session).
- Frontend: `RestorePasswordPage.jsx` (+ test).
- Docs: `backend/README.md` Brevo template row (template params now include the full URLs), `backend/AGENTS.md` if it describes link building in templates.
- **Coordination:** `retire-legacy-password-route` also MODIFIES "Authenticated auth routes require a session" and `add-email-verification` also MODIFIES "Self-service registration creates a company and its owner". Apply this change first or rebase the later MODIFIED blocks on it.

## Out of scope

- Changing token formats, expiry or the restore page URL itself.
- Naming existing unnamed companies (admin data fix, if wanted).
- Moving the existing-account notice to a code-built link.
