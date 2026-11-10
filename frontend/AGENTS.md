# Frontend rules — React SPA

Rules describe how this codebase is written today. Follow them for all new and modified code.

## Stack & runtime

- React 19 + Vite 8 + Mantine 9, `react-router` 8, axios, optional PostHog. Plain JSX (no TypeScript).
- i18next + react-i18next (Spanish only), `@mantine/notifications` for toasts.
- Node 26 (`engines.node`). ESLint 9 flat config (`eslint.config.js`): js recommended + react + react-hooks + react-refresh. Run `npm run lint` (`eslint .`) and `npm test` from `frontend/`.
- 2-space indent, single quotes, semicolons, trailing commas — encoded in `.prettierrc.json`. `npm run format` (Prettier) formats the package; `npm run format:check` verifies. Format only the files you touch; whole-repo reformats go in their own `style(frontend)` commit.
- Never create `.mjs` (or `.cjs` other than the existing PostCSS config) files — the package is `"type": "module"`, so plain `.js` is ESM and is what the ESLint `files` globs cover.

## Structure

- `src/pages/<area>/` — one folder per area: `index/` (public site), `auth/`, `user/`, `admin/`. Each area has a `*Wrapper.jsx` layout component.
- `src/components/partials/` — navbars/footers; `src/components/auth/` — forms; `src/components/navBarElements/` — navbar action buttons. Shared app components (`ErrorBoundary.jsx`, `PageLoader.jsx`, `Seo.jsx`, `StatCard.jsx`, `DetailRow.jsx`, `LockedTooltip.jsx`, `DebouncedSearchInput.jsx`, `ConsentBanner.jsx`) live directly in `src/components/` — reuse them instead of redefining per page. `src/hooks/` — shared hooks (`useCursorList`, `useCompanyPermissions`); `src/routes/lazyPages.js` — lazy route imports; `src/analytics/` — PostHog loader, consent store, URL sanitizer.
- `src/contexts/` — React contexts (server state). `src/config/` — `API/axiosConfig.js` and `plans.js`. `src/utils/` — shared helpers (`notifications.js`). `src/i18n/` — i18next init (`index.js`) + the Spanish catalog (`locales/es.json`).
- `prop-types` stays a dependency only because ESLint's `react/prop-types` (from `react.configs.recommended`) requires declared props; React 19 ignores `propTypes` at runtime. Declare `propTypes` on every component that takes props.
- Section components used only by the homepage live in `src/pages/index/sections/`; `src/index.css` holds global rules only.
- Components export both named and default (`export function LoginForm` + `export default LoginForm`).

## Routing & guards

- Single route tree in `src/main.jsx` — add new pages there, colocated with their area wrapper. Every route except `Homepage` and `LoginPage` is a `React.lazy` import declared in `src/routes/lazyPages.js` (import-only module); one `<Suspense fallback={<PageLoader />}>` in `main.jsx` covers them all. A failed chunk (stale tab after a deploy) reloads once — `vite:preloadError` listener + `ErrorBoundary`, both via `src/utils/chunkReload.js`.
- Area wrappers own session guarding: call `GET /api/v1/auth/session`; on failure `navigate('/auth/login')`; render `<Outlet />` only after the check (`UserWrapper.jsx` is the reference). The check runs once per mount (plus retries): read `navigate` through a ref, never list it as an effect dependency — its identity changes on every pathname change and would re-run the check, unmounting the layout on each navigation.
- Post-login routing by role: `superadmin` → `/admin`, `user` → `/dashboard`. The user area is one pathless layout route (`<Route element={<UserWrapper />}>` with `dashboard` and `user/*` children) so the wrapper stays mounted across it; `/user` redirects to `/dashboard`.
- Wrappers redirect to login only on a 401; any other session-check failure renders `SessionCheckError` with a retry. `UserWrapper` sends superadmins to `/admin` and exposes `{ sessionUser, user, userLoading }` (`user` = `GET /api/v1/user`, fetched once per area mount) via its outlet context — pages read it with `useOutletContext()` instead of refetching. `AdminDashboardWrapper` exposes the signed-in admin via `<Outlet context={{ sessionUser }} />`.
- Every redirect to login carries `?next=<current path>` (`loginRedirectPath(currentPath())` from `src/utils/safeNext.js`): the axios 401 interceptor, the wrappers' 401 branch, and auth-endpoint 401s handled in place (`PasswordUpdateForm`). `LoginForm` honours `next` only through `safeNextPath()` — same-origin, starts with `/`, never `//` or `/\`, never `/auth/*`.
- Module-level caches that hold per-session data register a reset with `registerSessionCache()` (`src/utils/sessionCaches.js`); `invalidateSessionCaches()` runs on login, logout, account deletion and 401, and bumps a generation counter that in-flight fetches check before writing back (`hooks/useCompanyPermissions.js` is the reference). Read the caller's company permissions through `useCompanyPermissions()` — never fetch `/api/v1/team` just for `callerPermissions`.

## API access

- All requests go through the shared `apiClient` (`src/config/API/axiosConfig.js`): `withCredentials`, 10s timeout, `VITE_API_BASE_URL` base. Never use `fetch` directly, never create other axios instances.
- Paths always include the version prefix (`/api/v1/...`).
- Never `console.*` an axios error — `error.config.data` holds the request body (passwords). Use `logApiError(context, err)` (`src/utils/logApiError.js`, dev-only, logs `{ status, code }`); `no-console` is an ESLint error.
- Handle API errors by status with user-facing Spanish messages (see `LoginForm.jsx`). Never render `error.response.data.message` or axios `err.message`; map status + `code` → `t()` — enforced by `no-restricted-syntax` in `eslint.config.js`.

## UI conventions

- Accessibility: every layout renders `<SkipLink />` first and its content inside `<main id={MAIN_CONTENT_ID} tabIndex={-1}>` (`src/components/SkipLink.jsx`); `RouteFocus` (mounted once in `main.jsx`) moves focus to the new page's first `h1`/`h2` on navigation, so each page starts with a heading. Burgers set `aria-controls`/`aria-expanded`; inputs without a visible label get `aria-label`; email inputs use `type="email"` + `autoComplete`.
- Theme lives in `src/theme/theme.js` (primary `brand` colour, component defaults, font) and is passed to `MantineProvider`. Use `--mantine-primary-color-*` / theme tokens in CSS — never hard-coded colour names or `!important`. Fonts are self-hosted with `@fontsource/*` (CSP `font-src 'self'`); never load Google Fonts or other CDNs.
- Mantine components + `@tabler/icons-react` icons only. Page-specific styles in colocated `*.module.css`.
- Forms: uncontrolled inputs with `name` attributes, read via `e.target.<name>` in `onSubmit`; surface API errors with Mantine `Alert`.
- UI copy lives in `src/i18n/locales/es.json` — never as literals in JSX. Use `useTranslation()`/`t('key')` (or `<Trans>` when copy contains links/components); `t` from `i18next` in class components. Spanish only (`lng: 'es'`); code, identifiers, and comments are English.
- One-off action feedback (saves, checkout/portal, logout) → toasts via `notifySuccess`/`notifyError` from `src/utils/notifications.js` (`<Notifications />` is mounted in `main.jsx`). Errors tied to a form the user is fixing → inline `Alert`.
- Permission-locked actions render disabled with an explanatory tooltip, never hidden: gate only the `disabled` prop and wrap the locked control in `<LockedTooltip locked label>` (`src/components/LockedTooltip.jsx`: focusable span + `aria-describedby`, since disabled controls fire no pointer events and are skipped by the keyboard). `Team.jsx` is the reference. Per-row locks come from the API (`manageable` on team members/invites, `callerId` for the caller's own row) — combine them with the permission check rather than re-deriving role ranks client-side. Route-level role gating (area wrappers, `main.jsx`) is separate and stays as-is.
- Every page renders `<Seo>` (`src/components/Seo.jsx`, React 19 meta hoisting): public pages pass `title`/`description`/`path`; internal pages pass `title` only — `robots` defaults from `path` (public → `index, follow`, internal/auth/404 → `noindex, nofollow`), `og:image`/Twitter card default to `public/og-image.png` (replace the placeholder). Each page gets a distinct title key (`seo.pages.*`). New public routes go in `src/config/publicRoutes.js` too — `vite build` emits `robots.txt` and `sitemap.xml` from it with the `VITE_SITE_BASE_URL` origin. `index.html` only carries a fallback `<title>` — description, canonical and `og:*` come from `Seo` alone. Sections embedded in several pages (`pages/index/sections/*`) never render `<Seo>`; the route page does (`FAQPage.jsx`).
- Prices are never hardcoded in copy: render them from `PLANS` (`src/config/plans.js`) through `formatPlanPrice` (`src/utils/formatPrice.js`, `Intl.NumberFormat('es-ES')`).
- Cursor-paginated lists use `useCursorList({ fetchPage, rowsKey, countKey, onLoadMoreError })` (abort + request id discard stale pages; `reload` after mutations) with a `DebouncedSearchInput` (owns keystrokes, 400ms, requires an accessible `label`). `AdminUsersList.jsx` is the reference.
- `AreaShell` takes either flat `links` or labelled `sections: [{ label, links }]`.
- Full-page/wrapper loads → `PageLoader` (`src/components/PageLoader.jsx`); in-content loads → inline `Skeleton` (`UserDashboard.jsx` is the reference).
- Analytics only through `src/analytics/posthog.js` (`identifyUser`, `resetAnalyticsUser`, `captureException`) — never import `posthog-js` elsewhere: it is dynamic-imported after first paint and only after the visitor accepts the `ConsentBanner`. `before_send` (`analytics/sanitizeUrl.js`) strips query strings/fragments from URL properties; pages that receive a token in the URL read it once into state and call `scrubQueryFromAddressBar()` (`src/utils/scrubUrlToken.js`).
- `ErrorBoundary` (`src/components/ErrorBoundary.jsx`, wired in `main.jsx` via `RoutedErrorBoundary`) catches render errors app-wide, shows the Spanish fallback and reports to PostHog when analytics are enabled; navigation resets it.
- Server state pattern: context provider + `useX()` hook + `refresh` function (`SubscriptionContext.jsx` + `useSubscription.js` is the reference — keep the context object and hook out of the `.jsx` provider file for Fast Refresh). A `refresh({ silent: true })` (background polling) never touches the loader or `error` and keeps the last good data on failure. No global state library.

## Environment & build

- Vite vars are `VITE_*`, baked at build time (Docker `ARG`s). New vars must be added to `.env.example` and the README table.
- Prod bundle: `vite build` → `dist/` (fails without `VITE_SITE_BASE_URL` or `VITE_API_BASE_URL`), served by unprivileged nginx on port 8080 (`nginx/default.conf.template` + `nginx/security-headers.inc.template`, rendered by envsubst; SPA history fallback, CSP/security headers). Any `location` that sets `add_header` must re-include `security-headers.inc`. Images are built and pushed by CI — no `docker-build:*`/push scripts in `package.json`.
## Tests

- Vitest + React Testing Library + jsdom: `npm test` (`vitest run`; `npm run test:watch` while developing). Config is the `test` block in `vite.config.js`; setup in `src/test/setup.js` (jest-dom matchers, Mantine browser stubs, cleanup).
- Specs are colocated as `*.test.js(x)` and import `describe/it/expect/vi` from `vitest` (no globals). Render components through `renderWithProviders` (`src/test/renderWithProviders.jsx`) inside a router.
- Mock the API with `vi.mock('…/config/API/axiosConfig.js', () => ({ default: { get: vi.fn(), … } }))` — no network, no MSW. Full-page redirects go through `src/utils/hardRedirect.js` so they can be mocked (jsdom's `window.location` cannot).
- Keep decision logic pure and testable (e.g. `pages/user/teamLocks.js`, `utils/safeNext.js`, `analytics/sanitizeUrl.js`) and cover security-relevant rules (redirect validation, cache invalidation, URL sanitizing, permission locks) with specs.
