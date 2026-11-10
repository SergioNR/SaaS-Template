# Proposal

## Why

- **Consent cannot be withdrawn from the private areas.** The only cookie-preferences control lives in `SiteFooter` (`frontend/src/components/partials/SiteFooter.jsx:82-86`), which renders in the public site, the auth area and the 404 page only. The user and admin areas use `AreaShell` with no footer, so a signed-in visitor who accepted analytics must log out (or find a public page) to change their mind. Withdrawing consent should be as easy as giving it, and the banner itself does render in every area (`main.jsx:106`).
- **Admins are never identified.** `identifyUser` is only called from `UserWrapper` (`pages/user/UserWrapper.jsx:111-115`). A consenting superadmin is captured anonymously for the whole session, so admin activity cannot be told apart from anonymous traffic and logout's identity reset has nothing to reset.

## What Changes

- `AreaShell` renders a cookie-preferences control at the bottom of the sidebar (next to logout) when analytics is configured; it calls the existing `resetAnalyticsConsent()` — capturing stops and the banner reappears. It is absent when analytics is not configured.
- `AdminDashboardWrapper` calls `identifyUser(sessionUser.id)` once the session check succeeds, like the user area (still a no-op without consent; identifies on later consent via the existing pending-identity path).
- Specs for both.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `public-site`: new requirement that consent can be changed from the private areas; "Identity and error reporting follow consent" names both private areas as identifying the signed-in user.
- `app-shell`: "Private areas share a navigation shell" lists the cookie-preferences control in the sidebar footer.

## Impact

- `frontend/src/components/partials/AreaShell.jsx` — control rendered under `analyticsEnabled`.
- `frontend/src/pages/admin/AdminDashboardWrapper.jsx` — `identifyUser` effect.
- `frontend/src/i18n/locales/es.json` — reuse `consent.manage`.
- Specs: `AreaShell.test.jsx` (control present/absent by `analyticsEnabled`, click calls `resetAnalyticsConsent`), `pages/wrapperGuards.test.jsx` (admin identify).
- No API change, no new env vars.
- Sequencing: `superadmin-self-service` also modifies "Private areas share a navigation shell" (admin account link); whichever change is applied second merges both edits into its MODIFIED block.

## Out of scope

- A full preferences dialog (granular categories) — the template has one analytics category.
- Changing the banner itself or the consent storage.
