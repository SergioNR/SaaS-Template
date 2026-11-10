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

Email from `sessionUser` (outlet context). No extra `GET /api/v1/user` fetch — nothing else is displayed.

## Open questions

- Should the page also show `activeSessionCount` (available only from the admin user-detail endpoint)? Default: no.
- Should self-deletion of a non-last superadmin require typing the email to confirm, given its blast radius? Default: same confirmation dialog as the user area, with a stronger warning line.
