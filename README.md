# Full-Stack Template

Full-stack template: an Express.js backend API with a React (Vite + Mantine) SPA.

## Layout

| Path | Contents |
| --- | --- |
| `backend/` | Express.js server — auth, billing, PostgreSQL/Prisma, Docker. See [backend/README.md](backend/README.md) |
| `frontend/` | React SPA — public site, auth, user/admin areas. See [frontend/README.md](frontend/README.md) |

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

## CI

GitHub Actions (`.github/workflows/docker-build-push.yaml`) runs a **test** job (backend `npm ci` → `npx prisma generate` → `npm test` → `npx eslint .`; frontend `npm ci` → `npx eslint .` → `npm test` → `npm run build`) on every pull request into `latest` / `next` and on every push to them. On pushes only, it then builds the backend image from `backend/` and the frontend image from `frontend/` and pushes both to Docker Hub, tagged `<branch>`, `<branch>-<date>` and `<branch>-<short sha>`. PR runs need no secrets.

The image jobs run in the GitHub **environment** named after the branch (`latest` or `next`), so values can be set per environment (Settings → Environments) or once at repository level (Settings → Secrets and variables → Actions); environment values take precedence.

| Name | Kind | Used by |
| --- | --- | --- |
| `DOCKERHUB_USERNAME` | Variable (required) | Both image jobs (Docker Hub login, image namespace) |
| `DOCKERHUB_TOKEN` | Secret (required) | Both image jobs (Docker Hub access token with read/write scope) |
| `VITE_API_BASE_URL`, `VITE_SITE_BASE_URL` | Variables (required) | Frontend build args |
| `VITE_PUBLIC_POSTHOG_KEY` | Variable (optional) | Frontend build arg |
| `NEXT_VITE_API_BASE_URL`, `NEXT_VITE_SITE_BASE_URL`, `NEXT_VITE_PUBLIC_POSTHOG_KEY` | Variables (optional) | Frontend build args for the `next` branch; each falls back to its `VITE_*` counterpart when unset |

The `VITE_*` values are baked into the public JS bundle, so they are Actions *variables*, not secrets.
