# Full-Stack Template

Full-stack template: an Express.js backend API with a React (Vite + Mantine) SPA.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Express.js server — auth, billing, PostgreSQL/Prisma, Docker. See [backend/README.md](backend/README.md) |
| `frontend/` | React SPA — public site, auth, user/admin areas. See [frontend/README.md](frontend/README.md) |
| `compose.yaml` / `compose.dev.yaml` | Deploy stacks: the CI-built `latest` / `next` images + Postgres |
| `.env.example` | Root environment for the deploy stacks, with the deploy checklist |
| `.github/` | CI workflows (PR gate, image build & push, CodeQL), Dependabot, PR templates |

Each package has its own lockfile and `AGENTS.md`; run `npm` commands inside `backend/` or `frontend/`, never at the root. Node 26 (`.nvmrc`).

## Quick start

```bash
# Backend
cd backend
cp .env.example .env
npm ci
docker compose up -d database
npx prisma migrate deploy
npm run start:local

# Frontend (in a second terminal)
cd frontend
cp .env.example .env
npm ci
npm run start:local
```

Optional demo data: `npx prisma db seed` in `backend/` (local database only).

Before opening a PR, run what the CI PR gate runs: `npm test` and `npx eslint .` in both packages, plus `npm run build` in `frontend/`.

## Deploy

CI pushes the images to Docker Hub; the root compose stacks run them next to a Postgres container (all ports bound to `127.0.0.1` — put a TLS-terminating reverse proxy in front).

```bash
cp .env.example .env   # then follow the deploy checklist at the top of it
docker compose pull && docker compose up -d --wait                                        # production (latest images)
docker compose -f compose.dev.yaml pull && docker compose -f compose.dev.yaml up -d --wait  # staging (next images, ports 8081/3001/5433)
```

The backend runs `prisma migrate deploy` on every start. Set `TAG` (or `NEXT_TAG`) in `.env` to a `<branch>-<short sha>` tag to roll back. `backend/compose.yaml` stays the local, database-only setup.

## CI

GitHub Actions (`.github/workflows/docker-build-push.yaml`) runs a **test** job (backend `npm ci` → `npx prisma generate` → `npm test` → `npx eslint .`; frontend `npm ci` → `npx eslint .` → `npm test` → `npm run build`) on every pull request into `latest` / `next` and on every push to them. On pushes only, it then builds the backend image from `backend/` and the frontend image from `frontend/` and pushes both to Docker Hub, tagged `<branch>`, `<branch>-<date>` and `<branch>-<short sha>`. PR runs need no secrets.

The image jobs run in the GitHub **environment** named after the branch (`latest` or `next`), so values can be set per environment (Settings → Environments) or once at repository level (Settings → Secrets and variables → Actions); environment values take precedence.

| Name | Kind | Used by |
| --- | --- | --- |
| `DOCKERHUB_USERNAME` | Variable (required) | Both image jobs (Docker Hub login, image namespace) |
| `DOCKERHUB_TOKEN` | Secret (required) | Both image jobs (Docker Hub access token with read/write scope) |
| `VITE_API_BASE_URL`, `VITE_SITE_BASE_URL` | Variables (required) | Frontend build args |
| `VITE_PUBLIC_POSTHOG_KEY` | Variable (optional) | Frontend build arg |
| `VITE_PUBLIC_POSTHOG_HOST` | Variable (optional) | Frontend build arg; defaults to the EU cloud. Changing it also means overriding `NGINX_CSP_POSTHOG_ORIGINS` at container runtime |
| `NEXT_VITE_API_BASE_URL`, `NEXT_VITE_SITE_BASE_URL`, `NEXT_VITE_PUBLIC_POSTHOG_KEY` | Variables (optional) | Frontend build args for the `next` branch; each falls back to its `VITE_*` counterpart when unset |

The `VITE_*` values are baked into the public JS bundle, so they are Actions *variables*, not secrets.

Also in `.github/`: `codeql.yml` (CodeQL code scanning on pushes, PRs and weekly) and `dependabot.yml` (weekly grouped updates for both npm packages, Actions and Docker images). The test job also runs a non-blocking `npm audit --omit=dev --audit-level=high` per package.

Recommended branch protection for `latest` and `next`: require a PR and the status checks **Test, lint and build** and **Analyze (javascript-typescript)**.
