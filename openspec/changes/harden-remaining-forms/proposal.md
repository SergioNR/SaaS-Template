# Proposal

## Why

Four small form defects remain after the earlier hardening passes:

- **Invite acceptance has no double-submit guard.** `acceptInvite` sets `submitting` but never checks it (`frontend/src/pages/auth/AcceptInvitePage.jsx:95-98`); two quick Enter presses before the busy state renders send two `POST /api/v1/auth/invite-accept` requests — the second answers 409/404 and shows a spurious error toast over a successful acceptance. The password-restore page guards with React state only (`pages/auth/RestorePasswordPage.jsx:64`), which is stale until the re-render, so it has the same window.
- **Forms read inputs as form properties**, against the `frontend/AGENTS.md` rule (`e.target.elements.<name>`; jsdom lacks named-property access, so these forms cannot be covered by specs): `AcceptInvitePage.jsx:103`, `RestorePasswordPage.jsx:69-70`, `components/auth/CustomerRegistrationForm.jsx:46-48`, `components/auth/PasswordUpdateForm.jsx:33-34`, `pages/user/Team.jsx:166`. None of these forms has a spec today.
- **The invite modal's Cancel button keeps the role error.** The modal's `onClose` clears `inviteRoleError`, but the Cancel button only closes the modal (`Team.jsx:539`), so reopening it shows "role required" before the user did anything.
- **The team "expired" badge is dead UI.** `Team.jsx:348,365-369` badges invites past `token_expires`, but `GET /api/v1/team` only returns unexpired invites (`team-management`: "Listing exposes only pending invites"); the badge can only appear if the tab sits open past an expiry, and then the row is stale anyway. The `app-shell` spec still requires it.

## What Changes

- Invite acceptance and password restore reject a second submit fired before the busy state renders (ref guard, as login/registration/recovery already do).
- All remaining forms read inputs via `form.elements.<name>`; each gains a colocated spec.
- Cancelling the invite modal resets its role and role error, same as closing it.
- The expired-invite badge (and its `now` state and i18n key) is removed; the spec requirement drops it. **BREAKING** only for the spec text, not for users.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `app-shell`: "Auth forms block double submission" extends the before-render guard to invite acceptance and password restore; "The team page has explicit loading and error states" drops the expired badge and requires the invite dialog to reset when dismissed by any means.

## Impact

- `frontend/src/pages/auth/AcceptInvitePage.jsx`, `pages/auth/RestorePasswordPage.jsx`, `components/auth/CustomerRegistrationForm.jsx`, `components/auth/PasswordUpdateForm.jsx`, `pages/user/Team.jsx`.
- `frontend/src/i18n/locales/es.json` — drop `team.invites.expiredBadge`.
- New specs: `AcceptInvitePage.test.jsx`, `RestorePasswordPage.test.jsx`, `CustomerRegistrationForm.test.jsx`, `PasswordUpdateForm.test.jsx`, `Team.test.jsx` (invite modal).
- No API change.

## Out of scope

- Moving `PasswordUpdateForm` off the deprecated `PATCH /api/v1/auth/update-user-password` alias (handled by `retire-legacy-password-route`).
- Client-side handling of an invite that expires while the page is open — the API rejects it on submit and the page already swaps to the expired state.
