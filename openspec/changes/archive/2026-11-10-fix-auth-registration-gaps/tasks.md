# Tasks

## 1. Emailed links

- [ ] 1.1 (manual, needs Brevo dashboard access - not done by the implementing agent; flagged in the PR) Check the live Brevo reset template (and the invite template) in each environment and record what link they build today; if any points at `/auth/reset-password`, note it in the PR - that environment's reset links are broken now
- [x] 1.2 Add a pure `frontendUrl(path, searchParams)` helper in `backend/server/integrations/brevo/transactionalEmails/brevo.js` (origin of `FRONT_WEB_APP_ORIGIN_URL`, path appended, params URL-encoded); verify unit cases: trailing slash, origin with a path, token with `-`/`_`
- [x] 1.3 Pass `resetPasswordUrl` (`/auth/restore-password?passwordResetToken=`) and `acceptInviteUrl` (`/auth/accept-invite?inviteToken=`) to the templates; fix the comments; verify `tests/brevoTransactionalEmails.spec.js` asserts both exact URLs
- [ ] 1.4 (dashboard part manual - flagged in the PR; README row updated) Update both Brevo templates to link `{{ params.resetPasswordUrl }}` / `{{ params.acceptInviteUrl }}`; update the `backend/README.md` Brevo row (params list); verify by requesting a reset locally with Brevo configured and opening the link

## 2. Required company name

- [x] 2.1 `createUserSchema.js`: `companyName` required (`isString` bail, `trim`, `notEmpty`, 2-100); remove the "optional for old clients" comment; verify `tests/validators.spec.js` (missing → 422, `"  "` → 422, `null` → 422, valid → passes)
- [x] 2.2 (no explicit fallback existed - `companyName` was passed through as `undefined`; dropped the controller test that pinned unnamed creation) Remove the unnamed-company fallback from the registration path (`registerUserInBackground` / `createUserInDb`) if it exists only for this case; keep the column nullable; verify `authController.spec.js` / `userModel.spec.js`
- [x] 2.3 Update the register OpenAPI block in `authRouter.js` (`companyName` in `required`); verify `tests/openapiCoverage.spec.js`

## 3. Auth router fallback

- [x] 3.1 Restructure `authRouter.js` composition so `checkAuthentication()` applies only to the private routes and the `/*fallback` 404 runs for every unmatched path; verify `tests/appIntegration.spec.js`: unauthenticated `GET /api/v1/auth/nope` → 404 with the route-not-found `message`; unauthenticated `POST /api/v1/auth/logout` and `GET /api/v1/auth/session` → 401 `{}`; authenticated unknown path → 404
- [x] 3.2 Confirm the SPA does not rely on 401 from unknown auth paths (grep `frontend/src` for `/api/v1/auth/` calls); verify by reading the call list

## 4. Frontend cleanup

- [x] 4.1 (mapping extracted to pure `restorePasswordErrors.js` + spec, so `harden-remaining-forms` can own `RestorePasswordPage.test.jsx`) `frontend/src/pages/auth/RestorePasswordPage.jsx`: remove the submit 404 branch (400 → expired/invalid, 422 → invalid, else generic); adjust its test; verify `npm test` and `npm run lint` in `frontend/`

## 5. Docs and validation

- [x] 5.1 Commit the API part as `feat(auth)!` with a BREAKING CHANGE footer for the required `companyName`
- [x] 5.2 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [x] 5.3 `npx -y @fission-ai/openspec@1.16.0 validate fix-auth-registration-gaps --strict` passes
