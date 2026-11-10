# Tasks

## 1. Double-submit guards

- [ ] 1.1 `frontend/src/pages/auth/AcceptInvitePage.jsx`: add a `submittingRef` guard (set before the request, cleared on failure; kept on success until navigation) mirroring `CustomerRegistrationForm.jsx`
- [ ] 1.2 `frontend/src/pages/auth/RestorePasswordPage.jsx`: replace the state-only `if (submitting)` check with a ref guard

## 2. Read inputs through `form.elements`

- [ ] 2.1 Switch `AcceptInvitePage.jsx:103`, `RestorePasswordPage.jsx:69-70`, `CustomerRegistrationForm.jsx:46-48`, `PasswordUpdateForm.jsx:33-34` and `Team.jsx:166` to `form.elements.<name>.value` (capture `e.currentTarget` before any await)
- [ ] 2.2 `grep -rnE "(e|event|form)\.target\.[a-zA-Z]+\.value|form\.[a-zA-Z]+\.value" frontend/src` returns no form-field reads outside `elements`

## 3. Team page

- [ ] 3.1 `Team.jsx`: route the invite modal's Cancel button through the same close handler as `onClose` (resets `inviteRole` and `inviteRoleError`, no-op while inviting)
- [ ] 3.2 `Team.jsx`: delete the expired-badge branch and the `now` state/effect that only feeds it; drop `team.invites.expiredBadge` from `es.json`

## 4. Specs

- [ ] 4.1 `AcceptInvitePage.test.jsx`: double Enter sends one request; 201 → success notice + navigate to login; 400 `INVITER_INVALID` → invalid state
- [ ] 4.2 `RestorePasswordPage.test.jsx`: mismatch blocks submit; double Enter sends one request; 200 → success state
- [ ] 4.3 `CustomerRegistrationForm.test.jsx` and `PasswordUpdateForm.test.jsx`: values reach the API via `elements`; error mapping per status/code
- [ ] 4.4 `Team.test.jsx`: submit without role → role error; Cancel then reopen → no role error; invite rows render no expired badge

## 5. Verification

- [ ] 5.1 `npm run lint` and `npm test` in `frontend/` pass
- [ ] 5.2 `npx -y @fission-ai/openspec@1.16.0 validate harden-remaining-forms --strict` passes
