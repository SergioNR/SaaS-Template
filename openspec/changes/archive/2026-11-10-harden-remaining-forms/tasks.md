# Tasks

## 1. Double-submit guards

- [x] 1.1 `frontend/src/pages/auth/AcceptInvitePage.jsx`: add a `submittingRef` guard (set before the request, cleared on failure; kept on success until navigation) mirroring `CustomerRegistrationForm.jsx`
- [x] 1.2 `frontend/src/pages/auth/RestorePasswordPage.jsx`: replace the state-only `if (submitting)` check with a ref guard

## 2. Read inputs through `form.elements`

- [x] 2.1 Switch `AcceptInvitePage.jsx:103`, `RestorePasswordPage.jsx:69-70`, `CustomerRegistrationForm.jsx:46-48`, `PasswordUpdateForm.jsx:33-34` and `Team.jsx:166` to `form.elements.<name>.value` (capture `e.currentTarget` before any await)
- [x] 2.2 `grep -rnE "(e|event|form)\.target\.[a-zA-Z]+\.value|form\.[a-zA-Z]+\.value" frontend/src` returns no form-field reads outside `elements`

## 3. Team page

- [x] 3.1 `Team.jsx`: route the invite modal's Cancel button through the same close handler as `onClose` (resets `inviteRole` and `inviteRoleError`, no-op while inviting)
- [x] 3.2 `Team.jsx`: delete the expired-badge branch and the `now` state/effect that only feeds it; drop `team.invites.expiredBadge` from `es.json`

## 4. Specs

- [x] 4.1 `AcceptInvitePage.test.jsx`: double Enter sends one request; 201 → success notice + navigate to login; 400 `INVITER_INVALID` → invalid state
- [x] 4.2 `RestorePasswordPage.test.jsx`: mismatch blocks submit; double Enter sends one request; 200 → success state
- [x] 4.3 `CustomerRegistrationForm.test.jsx` and `PasswordUpdateForm.test.jsx`: values reach the API via `elements`; error mapping per status/code
- [x] 4.4 `Team.test.jsx`: submit without role → role error; Cancel then reopen → no role error; invite rows render no expired badge

## 5. Verification

- [x] 5.1 `npm run lint` and `npm test` in `frontend/` pass
- [x] 5.2 `npx -y @fission-ai/openspec@1.16.0 validate harden-remaining-forms --strict` passes
