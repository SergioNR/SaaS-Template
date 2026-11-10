# Frontend rules — React SPA

Rules describe how this codebase is written today. Follow them for all new and modified code.

## Stack & runtime

- React 19 + Vite 8 + Mantine 9, `react-router` 8, axios, optional PostHog. Plain JSX (no TypeScript).
- i18next + react-i18next (Spanish only), `@mantine/notifications` for toasts.
- Node 26 (`engines.node`). ESLint 9 flat config (`eslint.config.js`): js recommended + react + react-hooks + react-refresh. Run `npx eslint .` from `frontend/`.
- 2-space indent, single quotes, semicolons, trailing commas — encoded in `.prettierrc.json`. `npm run format` (Prettier) formats the package; `npm run format:check` verifies. Format only the files you touch; whole-repo reformats go in their own `style(frontend)` commit.
- Never create `.mjs` (or `.cjs` other than the existing PostCSS config) files — the package is `"type": "module"`, so plain `.js` is ESM and is what the ESLint `files` globs cover.

## Structure

- `src/pages/<area>/` — one folder per area: `index/` (public site), `auth/`, `user/`, `admin/`. Each area has a `*Wrapper.jsx` layout component.
- `src/components/partials/` — navbars/footers; `src/components/auth/` — forms; `src/components/navBarElements/` — navbar action buttons. Shared app components (`ErrorBoundary.jsx`, `PageLoader.jsx`, `Seo.jsx`) live directly in `src/components/`.
- `src/contexts/` — React contexts (server state). `src/config/` — `API/axiosConfig.js` and `plans.js`. `src/utils/` — shared helpers (`notifications.js`). `src/i18n/` — i18next init (`index.js`) + the Spanish catalog (`locales/es.json`).
- Components export both named and default (`export function LoginForm` + `export default LoginForm`).

## Routing & guards

- Single route tree in `src/main.jsx` — add new pages there, colocated with their area wrapper.
- Area wrappers own session guarding: call `GET /api/v1/auth/session`; on failure `navigate('/auth/login')`; render `<Outlet />` only after the check (`UserWrapper.jsx` is the reference). The check runs once per mount (plus retries): read `navigate` through a ref, never list it as an effect dependency — its identity changes on every pathname change and would re-run the check, unmounting the layout on each navigation.
- Post-login routing by role: `superadmin` → `/admin`, `user` → `/dashboard`. The user area is one pathless layout route (`<Route element={<UserWrapper />}>` with `dashboard` and `user/*` children) so the wrapper stays mounted across it; `/user` redirects to `/dashboard`.
- Wrappers redirect to login only on a 401; any other session-check failure renders `SessionCheckError` with a retry. `UserWrapper` sends superadmins to `/admin`; `AdminDashboardWrapper` exposes the signed-in admin via `<Outlet context={{ sessionUser }} />`.

## API access

- All requests go through the shared `apiClient` (`src/config/API/axiosConfig.js`): `withCredentials`, 10s timeout, `VITE_API_BASE_URL` base. Never use `fetch` directly, never create other axios instances.
- Paths always include the version prefix (`/api/v1/...`).
- Never `console.*` an axios error — `error.config.data` holds the request body (passwords). Use `logApiError(context, err)` (`src/utils/logApiError.js`, dev-only, logs `{ status, code }`); `no-console` is an ESLint error.
- Handle API errors by status with user-facing Spanish messages (see `LoginForm.jsx`). Never render `error.response.data.message` or axios `err.message`; map status + `code` → `t()` — enforced by `no-restricted-syntax` in `eslint.config.js`.

## UI conventions

- Mantine components + `@tabler/icons-react` icons only. Page-specific styles in colocated `*.module.css`.
- Forms: uncontrolled inputs with `name` attributes, read via `e.target.<name>` in `onSubmit`; surface API errors with Mantine `Alert`.
- UI copy lives in `src/i18n/locales/es.json` — never as literals in JSX. Use `useTranslation()`/`t('key')` (or `<Trans>` when copy contains links/components); `t` from `i18next` in class components. Spanish only (`lng: 'es'`); code, identifiers, and comments are English.
- One-off action feedback (saves, checkout/portal, logout) → toasts via `notifySuccess`/`notifyError` from `src/utils/notifications.js` (`<Notifications />` is mounted in `main.jsx`). Errors tied to a form the user is fixing → inline `Alert`.
- Permission-locked actions render disabled with an explanatory tooltip, never hidden: gate only the `disabled` prop and wrap the locked control in a `Tooltip` around a `<span>` (disabled controls don't fire pointer events). `Team.jsx` is the reference. Per-row locks come from the API (`manageable` on team members/invites, `callerId` for the caller's own row) — combine them with the permission check rather than re-deriving role ranks client-side. Route-level role gating (area wrappers, `main.jsx`) is separate and stays as-is.
- Every page renders `<Seo>` (`src/components/Seo.jsx`, React 19 meta hoisting): public pages pass `title`/`description`/`path`; internal pages pass `title` only. `index.html` only carries a fallback `<title>` — description, canonical and `og:*` come from `Seo` alone. Sections embedded in several pages (`pages/index/sections/*`) never render `<Seo>`; the route page does (`FAQPage.jsx`).
- Prices are never hardcoded in copy: render them from `PLANS` (`src/config/plans.js`) through `formatPlanPrice` (`src/utils/formatPrice.js`, `Intl.NumberFormat('es-ES')`).
- Full-page/wrapper loads → `PageLoader` (`src/components/PageLoader.jsx`); in-content loads → inline `Skeleton` (`UserDashboard.jsx` is the reference).
- Analytics only through `src/analytics/posthog.js` (`identifyUser`, `resetAnalyticsUser`, `captureException`) — never import `posthog-js` elsewhere: it is dynamic-imported after first paint and only after the visitor accepts the `ConsentBanner`. `before_send` (`analytics/sanitizeUrl.js`) strips query strings/fragments from URL properties; pages that receive a token in the URL read it once into state and call `scrubQueryFromAddressBar()` (`src/utils/scrubUrlToken.js`).
- `ErrorBoundary` (`src/components/ErrorBoundary.jsx`, wired in `main.jsx` via `RoutedErrorBoundary`) catches render errors app-wide, shows the Spanish fallback and reports to PostHog when analytics are enabled; navigation resets it.
- Server state pattern: context provider + `useX()` hook + `refresh` function (`SubscriptionContext.jsx` + `useSubscription.js` is the reference — keep the context object and hook out of the `.jsx` provider file for Fast Refresh). A `refresh({ silent: true })` (background polling) never touches the loader or `error` and keeps the last good data on failure. No global state library.

## Environment & build

- Vite vars are `VITE_*`, baked at build time (Docker `ARG`s). New vars must be added to `.env.example` and the README table.
- Prod bundle: `vite build` → `dist/` (fails without `VITE_SITE_BASE_URL`), served by unprivileged nginx on port 8080 (`nginx/default.conf.template` + `nginx/security-headers.inc.template`, rendered by envsubst; SPA history fallback, CSP/security headers). Any `location` that sets `add_header` must re-include `security-headers.inc`. Images are built and pushed by CI — no `docker-build:*`/push scripts in `package.json`.
- No test framework yet — do not invent one without discussion.
