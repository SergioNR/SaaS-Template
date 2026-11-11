# Proposal

## Why

Superadmins have no self-service account UI. `UserWrapper` always sends them to `/admin` (`frontend/src/pages/user/UserWrapper.jsx:50-53`), so they can never reach `/user/profile`, and the admin area has no profile page (`main.jsx:71-76`: overview, users, companies only). Yet the locked delete action on their own row in the users list says "use your profile" (`i18n/locales/es.json` `admin.users.deleteSelfLocked`, rendered at `pages/admin/AdminUsersList.jsx:133`) — a dead end. A superadmin therefore cannot change their password (short of the password-reset email) or delete their own account, although the API already admits both roles on `PATCH /api/v1/user/password` and `DELETE /api/v1/user` (`account`: "Account routes require an authenticated user").

Separately, the admin users list maps 409 `LAST_COMPANY_OWNER`, any other 409 and 404 to distinct messages (`AdminUsersList.jsx:87-95`) but not `LAST_SUPERADMIN`, which the API returns when the target is the platform's last superadmin (`admin`: "The platform keeps at least one superadmin"); the operator gets the generic conflict message.

## What Changes

- New admin-area page `/admin/account` (sidebar link "My account"): shows the signed-in superadmin's email, the password-change form and the account-deletion card, reusing the user-area components.
- Self-deletion on that page maps 409 `LAST_SUPERADMIN` to a specific message (the user stays signed in); success clears session caches and analytics identity and lands on `/`, as on the user profile.
- The locked self-delete tooltip in the users list points to the new page.
- The users list maps 409 `LAST_SUPERADMIN` to its own message.
- No API change.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `admin`: new requirement for the SPA admin account page; "SPA admin area guard" lists the account page; "SPA users list deletion feedback" adds `LAST_SUPERADMIN` and the tooltip target.
- `app-shell`: the route tree lists `/admin/account`; the navigation shell lists the account link in the admin sidebar.

## Impact

- `frontend/src/main.jsx`, `src/routes/lazyPages.js` — new lazy route.
- New `frontend/src/pages/admin/AdminAccount.jsx`; `AdminDashboardWrapper.jsx` — sidebar link.
- `frontend/src/components/auth/PasswordUpdateForm.jsx`, `frontend/src/pages/user/AccountActionsForm.jsx` — made reusable across areas (see design.md); `AccountActionsForm` gains the `LAST_SUPERADMIN` branch.
- `frontend/src/pages/admin/AdminUsersList.jsx` — `LAST_SUPERADMIN` mapping.
- `frontend/src/i18n/locales/es.json` — page title/SEO key (`seo.pages.adminAccount`), nav label, last-superadmin messages, reworded `deleteSelfLocked`.
- Specs: `AdminAccount.test.jsx`, `AccountActionsForm.test.jsx`, `AdminUsersList.test.jsx`.
- Sequencing: `consent-controls-everywhere` also modifies "Private areas share a navigation shell"; whichever change is applied second must merge both edits into its MODIFIED block. `retire-legacy-password-route` (backend) moves `PasswordUpdateForm` to `PATCH /api/v1/user/password`; this change does not touch the endpoint.

## Out of scope

- Letting superadmins into the user area or giving them a company.
- Editing the admin's email or any other profile field (no such API).
- Admin-initiated password resets for other users.
