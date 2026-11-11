# Design

## Context

The user profile page (`pages/user/CustomerProfile.jsx`) composes `PasswordUpdateForm` and `AccountActionsForm`. Both are area-agnostic in what they call (`/api/v1/user*` or the legacy alias) and already compute the login `next` from `currentPath()`, so they work under `/admin/account` unchanged. What differs for a superadmin: the deletion copy (no company, no team), the `LAST_SUPERADMIN` refusal, and where profile data comes from (`AdminDashboardWrapper` exposes `{ sessionUser }`, not the `GET /api/v1/user` profile).

## Decisions

### Where the page lives

- **A. New `/admin/account` route in the admin area (recommended).** Keeps the role routing rule (superadmins never enter the user area) intact and needs no guard change.
- B. Let superadmins open `/user/profile` as an exception in `UserWrapper`. Rejected: the user area assumes a company (billing provider, team permissions) and would start requests that 403 for a company-less account.

### Reusing the forms

- **A. Reuse both components as-is, with an optional `variant`/copy prop on `AccountActionsForm` for the superadmin wording (recommended).** One deletion flow, one place that maps codes; `LAST_SUPERADMIN` handling goes into the shared component since only superadmins can receive it.
- B. Copy the forms into the admin area. Rejected: two diverging copies of security-relevant flows (session-cache reset, analytics reset).

### Data shown

The session check (`GET /api/v1/auth/session`) only returns `{ id, role }`, so `sessionUser` has no email. Options:

- **A. `AdminAccount` fetches `GET /api/v1/user` once per mount (chosen).** The endpoint already admits both platform roles (`account`), so no API change is needed; the email renders behind an inline `Skeleton` and falls back to an "email unavailable" line on failure — the forms stay usable either way. The email is passed to `PasswordUpdateForm` through a new optional `email` prop (the user area keeps reading it from `UserWrapper`'s outlet context).
- B. Add the email to the session payload. Rejected: changes an `auth` contract owned by another batch for a single page.

## Resolved questions

- `activeSessionCount` on the page: **no** (conservative default; it is only on the admin user-detail endpoint).
- Typed-email confirmation for a non-last superadmin's self-deletion: **no** — same confirmation dialog as the user area, with superadmin wording and an extra red warning line (`variant="superadmin"`).
- `LAST_SUPERADMIN` on self-deletion surfaces as an error toast (as the other deletion refusals already do); the dialog closes and the session, caches and analytics identity stay untouched.
