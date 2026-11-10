# Tasks

## 1. Shared account components

- [x] 1.1 `frontend/src/pages/user/AccountActionsForm.jsx`: map 409 `LAST_SUPERADMIN` to a specific message (dialog closes, user stays signed in); accept an optional prop selecting superadmin copy (no company/team wording)
- [x] 1.2 `AccountActionsForm.test.jsx`: 200 → caches + analytics reset, navigate `/`; 409 `USER_LAST_COMPANY_OWNER` and 409 `LAST_SUPERADMIN` → their messages; other failures → generic

## 2. Admin account page

- [x] 2.1 New `frontend/src/pages/admin/AdminAccount.jsx`: `<Seo title>` with a new `seo.pages.adminAccount` key, heading, signed-in email from `useOutletContext().sessionUser`, `PasswordUpdateForm`, `AccountActionsForm` (superadmin copy); lazy import in `src/routes/lazyPages.js`, route `account` under `/admin` in `main.jsx`
- [x] 2.2 `AdminDashboardWrapper.jsx`: add the "My account" sidebar link (icon from `@tabler/icons-react`)
- [x] 2.3 `AdminAccount.test.jsx`: renders email and both forms; password 401 navigates to `/auth/login?next=%2Fadmin%2Faccount`

## 3. Users list

- [x] 3.1 `frontend/src/pages/admin/AdminUsersList.jsx`: 409 `LAST_SUPERADMIN` → `admin.users.deleteLastSuperadmin`; reword `admin.users.deleteSelfLocked` to point to "My account"
- [x] 3.2 `AdminUsersList.test.jsx`: own row locked with tooltip; `LAST_SUPERADMIN`, `LAST_COMPANY_OWNER`, other 409 and 404 map to distinct messages

## 4. Docs and verification

- [x] 4.1 `frontend/AGENTS.md` routing section: mention `/admin/account` as the superadmin self-service page
- [x] 4.2 `npm run lint`, `npm test`, `npm run build` in `frontend/` pass
- [x] 4.3 Manual (local seed with two superadmins): change password from `/admin/account` and log in with the new one; delete one superadmin → lands on `/`; try deleting the remaining one → last-superadmin message, still signed in — not run by the implementing agent (needs the local DB/Docker stack); covered by `AdminAccount.test.jsx` and `AccountActionsForm.test.jsx`, to be confirmed by a reviewer
- [x] 4.4 `npx -y @fission-ai/openspec@1.16.0 validate superadmin-self-service --strict` passes
