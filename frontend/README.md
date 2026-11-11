# Frontend Template

React single-page application built with Vite and Mantine. It ships with:

- **Public site** — landing page, pricing, FAQ and terms pages with placeholder content
- **Authentication** — login (returns to the page you were on after a session expiry), registration, password reset/recovery and team invite acceptance
- **User area** — dashboard, profile, team management (invites, roles, removal) and Stripe billing (checkout + customer portal)
- **Admin area** — overview stats, searchable user and company lists with detail pages, user deletion
- **Analytics** — optional PostHog product analytics, enabled when a key is configured. Opt-in: a consent banner asks first, and `posthog-js` is only downloaded (after first paint) once the visitor accepts. Query strings and fragments are stripped from every captured URL, and the reset/invite token pages remove their token from the address bar

- **Theme** — neutral Mantine theme in `src/theme/theme.js` with a self-hosted font (`@fontsource/inter`); rebrand there

Every route except the landing page and login is code-split (`src/routes/lazyPages.js`).

## Getting started

```bash
npm ci
npm run start:local
```

The app expects the backend API to be running (see `../backend/README.md`). Copy `.env.example` to `.env` and adjust the values as needed.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start:local` | Start the Vite dev server locally |
| `npm run build` | Build the production bundle (`dist/`) |
| `npm run lint` | Lint the package with ESLint |
| `npm test` | Run the Vitest + Testing Library specs once (`npm run test:watch` to watch) |
| `npm run format` | Format the package with Prettier (`format:check` to verify only) |

## Environment variables

Because the app is built with Vite, all `VITE_*` variables are baked in at build time and must be provided as `--build-arg`s when building the Docker image (see `Dockerfile`). The image build fails if a required one is missing. An example list lives in `.env.example`.

| Variable | When | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | Build (required for `npm run build`) | Base URL of the backend API |
| `VITE_PUBLIC_POSTHOG_KEY` | Build (optional) | PostHog project key. Analytics stay disabled when unset |
| `VITE_PUBLIC_POSTHOG_HOST` | Build (optional) | PostHog ingestion host. Defaults to `https://eu.i.posthog.com`; keep `NGINX_CSP_POSTHOG_ORIGINS` in sync |
| `VITE_SITE_BASE_URL` | Build (required for `npm run build`) | Public URL of the deployed frontend (canonical / `og:url`). The dev server defaults to `http://localhost:5173` |
| `NGINX_CSP_API_ORIGIN` | Container runtime (optional) | API origin allowed in the CSP `connect-src`. Defaults to the `VITE_API_BASE_URL` build arg; override with `docker run -e NGINX_CSP_API_ORIGIN=https://api.example.com` |
| `NGINX_CSP_POSTHOG_ORIGINS` | Container runtime (required in the image, may be empty) | Space-separated PostHog origins allowed in the CSP `script-src` and `connect-src` — the ingestion and assets hosts of `VITE_PUBLIC_POSTHOG_HOST` (EU default: `https://eu.i.posthog.com https://eu-assets.i.posthog.com`) |
| `NGINX_CSP_CONNECT_EXTRA` | Container runtime (optional) | Space-separated extra origins allowed in the CSP `connect-src` — e.g. the S3/MinIO origin that presigned file uploads/downloads go to. Defaults to empty |

## SEO files

`npm run build` emits `robots.txt` and `sitemap.xml` into `dist/` using `VITE_SITE_BASE_URL` as the origin; the indexable routes live in `src/config/publicRoutes.js`. `public/og-image.png` is a neutral 1200×630 placeholder used for `og:image`/`twitter:image` — replace it with your own artwork (see the root README [Forking checklist](../README.md#forking-checklist)).

## Docker & deployment

The web app is packaged in a Docker image: an unprivileged nginx (`nginxinc/nginx-unprivileged`, runs as non-root) serving the built bundle on **port 8080**. The server config lives in `nginx/*.template` and is rendered with `envsubst` at container start (SPA history fallback, security headers incl. CSP, `no-cache` for `index.html`, immutable caching for `/assets/`, gzip). `GET /healthz` returns `200 ok` for container healthchecks, and `/api/*` returns 404 so a mistaken relative API call never gets `index.html`.

Published images are built and pushed by CI (`.github/workflows/`) on `latest`/`next`. To try the image locally:

```bash
docker build --build-arg VITE_API_BASE_URL=http://localhost:3000 --build-arg VITE_SITE_BASE_URL=http://localhost:8080 -t expressjs-template-front:local .
docker run --rm -p 8080:8080 expressjs-template-front:local
```

then open http://localhost:8080.
