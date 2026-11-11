# Proposal

## Why

The template ships deliberate placeholders that every product forked from it must replace, but they are scattered and only partly documented (the og-image note lives in `frontend/README.md`, the brand note in a `theme.js` comment). A fork that misses one ships "Your App", `hello@yourapp.com` or a neutral placeholder social image to production. Known placeholders:

- `frontend/public/og-image.png` — neutral 1200×630 placeholder used for `og:image`/`twitter:image`; `frontend/public/logo.svg` — favicon and brand mark.
- `frontend/src/theme/theme.js` — neutral `brand` scale (`DEFAULT_THEME.colors.blue`).
- Spanish copy defaults in `frontend/src/i18n/locales/es.json`: `common.siteName` ("Your App"), `common.contactEmail` (`hello@yourapp.com`), `footer.tagline`, homepage hero/features/how-it-works, FAQ, the terms page (incl. `support@yourapp.com`), pricing plan copy; `frontend/index.html` fallback `<title>`.
- Image and package names: `expressjs-template` / `expressjs-template-front` in `.github/workflows/docker-build-push.yaml`, `compose.yaml`, `compose.dev.yaml`, `backend/README.md`, `frontend/README.md`; package names `expressjs-template` (`backend/package.json`) and `expressjs-template-frontend` (`frontend/package.json` + lockfiles); OpenAPI title "Express.js Template API" (`backend/server/config/swagger.js`).
- Plan configuration: `frontend/src/config/plans.js` (`PRO`, 29 EUR) and `backend/server/config/planPrices.js` / Stripe price ids.
- Email: Brevo sender and template ids in `backend/.env.example`.

The template itself must keep its placeholders, so nothing is replaced here. No behaviour changes; tasks only (`skip_specs: true`).

## What Changes

- **Recommended:** add a "Forking checklist" section to the root `README.md` listing every placeholder above with its file, so a fork has one place to work through; link it from `frontend/README.md` and the `og-image`/`theme.js` notes.
- The README checklist is the tracker: a fork ticks it (or turns it into its own OpenSpec change); the template keeps it current whenever a placeholder is added. This change is archived once the section exists, so the template's open-work queue only holds work the template itself does.
- Optional: a small `grep`-based check (`npm run check:placeholders` or a documented command) that lists remaining placeholder strings, for forks to run before their first deploy.

Alternative considered: README only, no change. Rejected at first because a change gives a fork an `/opsx:apply`-able checklist; on apply, an open change in the template that the template can never finish proved the worse home — the README checkbox list carries the same items and a fork can propose its own change from it.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none: documentation / fork checklist only (skip_specs) -->

## Impact

- Template: root `README.md` (new section), `frontend/README.md` link.
- Fork (when applied there): the files listed in Why, plus Docker Hub repository names and the root `.env` (`DOCKERHUB_USERNAME`, image tags).

## Out of scope

- Multi-language support or replacing Spanish as the UI language.
- Rebranding the template itself.
