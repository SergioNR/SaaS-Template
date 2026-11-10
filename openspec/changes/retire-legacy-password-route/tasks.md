# Tasks

## 1. Frontend switch (ship first)

- [ ] 1.1 `frontend/src/components/auth/PasswordUpdateForm.jsx`: call `PATCH /api/v1/user/password`; verify its test asserts the new URL
- [ ] 1.2 Confirm the global 401 handler (app-shell `apiClient` interceptor) covers `/api/v1/user/*`, then remove the local 401 branch and its comment; verify a test: 401 from the password change resets caches and navigates to `/auth/login?next=%2Fuser%2Fprofile`
- [ ] 1.3 Run `npm test`, `npm run lint` and `npm run build` in `frontend/`; all clean

## 2. Remove the alias (BREAKING)

- [ ] 2.1 Delete the `update-user-password` route and its OpenAPI block from `backend/server/API/v1/routes/authRouter.js`; remove unused imports; verify `npx eslint .`
- [ ] 2.2 Remove alias mentions from `userRouter.js` / `userController.js` comments; verify `grep -rn "update-user-password" backend frontend/src` returns nothing
- [ ] 2.3 Tests: drop alias cases; add `appIntegration.spec.js` case: authenticated `PATCH /api/v1/auth/update-user-password` → 404; verify `npm test` in `backend/`
- [ ] 2.4 Commit as `feat(auth)!: remove deprecated update-user-password alias` with a BREAKING CHANGE footer naming the replacement route

## 3. Docs and validation

- [ ] 3.1 Update `backend/README.md` and `backend/AGENTS.md` (no alias); after archiving, remove the alias from the `account` spec Purpose line
- [ ] 3.2 `npx -y @fission-ai/openspec@1.16.0 validate retire-legacy-password-route --strict` passes
