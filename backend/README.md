# Express.js Server Template

A production-ready Express.js backend template with authentication, billing, and database integrations out of the box.

## Features

- **Authentication** — Passport.js local strategy with session-based auth (stored in PostgreSQL), password reset flow via email tokens, and two role layers: platform roles (`user` / `superadmin` for SaaS-provider staff) and company roles (`company_owner` / `company_admin` / `company_member`)
- **Team management** — company member invites (single-use email tokens), member removal and role changes
- **Database** — PostgreSQL with Prisma ORM, migrations, and a Prisma-backed session store
- **Billing** — Stripe subscriptions (checkout sessions, customer portal, webhook handling)
- **Email** — Brevo transactional emails
- **File uploads** — S3-compatible storage (AWS S3 or MinIO) via presigned URLs; optional feature, enabled when `S3_BUCKET` is set
- **Analytics** — PostHog product analytics
- **Logging** — Pino structured logs (pretty-printed on localhost, JSON elsewhere) with Telegram alerts for errors
- **Security** — Helmet, CORS, rate limiting, request throttling, input validation (express-validator), bcrypt password hashing
- **Scheduled jobs** — cron-based cleanup (expired password reset tokens, expired team invites, abandoned file uploads)
- **Docker** — production image (tini + non-root + `/health` HEALTHCHECK), Docker Compose for the local database

## Requirements

- Node.js 26.x
- Docker (for the database, or provide your own PostgreSQL)

## Getting started

1. Copy `.env.example` to `.env` and fill in the values:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm ci
   ```

3. Start the database and apply migrations:

   ```bash
   docker compose up -d --wait database
   npx prisma migrate deploy
   ```

4. Start the server:

   ```bash
   npm run start:local
   ```

## File storage (S3-compatible)

The `/api/v1/files` endpoints run against any S3-compatible provider (AWS S3, MinIO, ...) using presigned URLs: the API registers the file and hands out a short-lived upload URL, the client puts the bytes straight into the bucket, and downloads fetch a fresh presigned URL per request. The feature is off until `S3_BUCKET` is set — the server boots normally either way.

Uploads are constrained at request time by `S3_MAX_FILE_SIZE_MB` and `S3_ALLOWED_MIME_TYPES`; roles govern who can use the endpoints via the seeded `files.view` / `files.upload` / `files.delete` company permissions (`company_member` gets view + upload, `company_owner`/`company_admin` get all three).

Bring your own bucket for local development. The fastest way is a throwaway MinIO:

```bash
docker run --name template-minio -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```

Create the bucket (root user `minioadmin` / `minioadmin`, via the console at http://localhost:9001 or the `mc` CLI):

```bash
docker run --rm --network host minio/mc sh -c "mc alias set local http://localhost:9000 minioadmin minioadmin && mc mb local/template-files"
```

Then fill the `S3_*` block in `.env`:

```bash
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET=template-files
S3_FORCE_PATH_STYLE=true
```

For AWS, leave `S3_ENDPOINT` empty and point `S3_REGION`/credentials/bucket at your account (`S3_FORCE_PATH_STYLE=false` if you prefer virtual-hosted addressing). Bucket credentials must allow `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on the bucket's objects.

## Scripts

| Command | Description |
| --- | --- |
| `npm run start` | Start the server |
| `npm run start:local` | Start locally with `--watch` using the `.env` file |
| `npm run stripe:listen` | Forward Stripe webhooks to localhost for testing |
| `npm test` | Run the test suite (Jest) |

## Environment variables

See `.env.example` for the full list. Key variables:

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Node environment (`production` in the Docker image) |
| `DEPLOY_ENVIRONMENT` | `localhost` for local development (disables global rate limiters, relaxes cookie flags, allows `localhost` dev-server origins, returns error details); any other value is treated as a deployed environment. The server refuses to boot with `DEPLOY_ENVIRONMENT=localhost` and `NODE_ENV=production` together |
| `TRUST_PROXY` | Express `trust proxy` setting: number of reverse-proxy hops in front of the app (e.g. `1`), `false` when the app is reached directly, or a comma-separated list of trusted addresses/subnets (e.g. `loopback, 10.0.0.0/8`). **Required** outside `DEPLOY_ENVIRONMENT=localhost` (defaults to `false` there); `true` is rejected because it lets clients spoof their IP and bypass rate limits |
| `SESSION_SECRET` | Express session secret. **Required** outside `DEPLOY_ENVIRONMENT=localhost` — like every required key, a missing value only logs a warning on localhost (sessions fall back to a fixed dev secret) |
| `PRISMA_POSTGRES_DIRECT_URL` / `PRISMA_POSTGRES_CONNECTION_STRING` | PostgreSQL connection strings. **Both required**: the direct (non-pooled) URL drives `prisma migrate deploy` (run by `start.sh` on every container boot) and `prisma db seed`; the connection string is the runtime client's and is checked at startup. Only `prisma generate` (Docker build) works without the direct URL |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Docker Compose database credentials |
| `STRIPE_API_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID` | Stripe billing configuration |
| `STRIPE_PRICE_ID_BASIC_MONTHLY` / `STRIPE_PRICE_ID_BASIC_YEARLY` | Stripe price ids for the Basic plan (monthly / yearly billing) |
| `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_YEARLY` | Stripe price ids for the Pro plan (monthly / yearly billing) |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | S3-compatible file storage. The whole files feature is an **optional feature flag**: when `S3_BUCKET` is unset the server boots normally and `/api/v1/files` is not mounted. `S3_ENDPOINT` targets a non-AWS provider (e.g. MinIO, `http://localhost:9000`); `S3_FORCE_PATH_STYLE` (default `true`) is required for MinIO. `S3_MAX_FILE_SIZE_MB` (default `50`) and `S3_ALLOWED_MIME_TYPES` (comma-separated whitelist with a sensible default) constrain uploads at request time |
| `BREVO_API_KEY` / `BREVO_SENDER_EMAIL` | Transactional email configuration - both **required** at startup (Brevo refuses sends without a verified sender) |
| `BREVO_RESET_PASSWORD_TEMPLATE_ID` / `BREVO_TEAM_INVITE_TEMPLATE_ID` | Brevo template ids for the password reset and team invite emails - **required** at startup (`.env.example` ships the historical defaults `2` and `3`). Every template receives `appOrigin` (= `FRONT_WEB_APP_ORIGIN_URL`) plus its own params (`passwordResetToken`; `inviteToken`, `companyName`, `inviterEmail`) so the link is built in the template body |
| `BREVO_ACCOUNT_EXISTS_TEMPLATE_ID` | Template id for the duplicate-registration notice (optional - notice is skipped when unset) |
| `POSTHOG_API_KEY` | Product analytics |
| `TELEGRAM_BOT_API_KEY` / `TELEGRAM_ERRORS_CHAT_ID` | Telegram alerts for `logError` only (info/warn stay in pino). Optional - sending is a no-op when the bot key is unset |
| `FRONT_WEB_APP_ORIGIN_URL` | Front-end origin (CORS allowlist, CSRF Origin check + Stripe redirects). **Required** outside `DEPLOY_ENVIRONMENT=localhost` |
| `PORT` | HTTP port (defaults to `3000`) |

## Request requirements

- **JSON only** — every `/api` request with a body must send `Content-Type: application/json` (other body types get `415`). Form/urlencoded bodies are not parsed.
- **Origin check (CSRF)** — non-`GET`/`HEAD`/`OPTIONS` requests must carry an `Origin` (or, failing that, `Referer`) header matching `FRONT_WEB_APP_ORIGIN_URL` (plus `localhost` dev-server ports when `DEPLOY_ENVIRONMENT=localhost`) or the API's own origin; otherwise `403`. Browsers send it automatically; for curl/Postman add e.g. `-H "Origin: http://localhost:5173"`. `/webhooks` is exempt.
- **Rate limits** — global 100 req / 15 min per IP plus progressive slow-down after 30 req / 5 min (capped at 2 s delay), disabled on localhost; credential endpoints share a 10 req / 15 min per-IP budget; login additionally allows 5 failed attempts / 15 min per account; password-reset emails 5 / hour per IP; `/webhooks` has its own 300 req / min per-IP budget (always on); `/health` is never limited.

## API overview

All routes are versioned under `/api/v1`. Interactive documentation is served by Swagger UI at [`/api/docs`](http://localhost:3000/api/docs) (raw OpenAPI spec at `/api/docs.json`), generated at server start from the `@openapi` JSDoc annotations declared next to each route definition.

| Area | Endpoints |
| --- | --- |
| Health | `GET /` (liveness), `GET /health` (readiness: `SELECT 1` against the database, 200 / 503, not rate limited) |
| Docs | `GET /api/docs` (Swagger UI), `GET /api/docs.json` (OpenAPI spec) |
| Auth | `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST /api/v1/auth/logout`, `GET /api/v1/auth/session`, password reset (`GET/POST/PATCH /api/v1/auth/password-reset`), `PATCH /api/v1/auth/update-user-password`, team invites (`GET /api/v1/auth/invite`, `POST /api/v1/auth/invite-accept`) |
| User | `GET /api/v1/user`, `DELETE /api/v1/user` |
| Billing | `GET/POST /api/v1/billing`, `POST /api/v1/billing/checkout-session`, `POST /api/v1/billing/customer-portal` |
| Files | `POST /api/v1/files` (register + presigned upload URL), `GET /api/v1/files` (cursor-paginated list), `GET /api/v1/files/:fileId/download` (presigned download URL), `DELETE /api/v1/files/:fileId` — only mounted when `S3_BUCKET` is set |
| Team | `GET /api/v1/team`, `POST /api/v1/team/invites`, `POST /api/v1/team/invites/:inviteId/resend`, `DELETE /api/v1/team/invites/:inviteId`, `DELETE/PATCH /api/v1/team/members/:userId` |
| Admin | `GET /api/v1/admin/users`, `GET /api/v1/admin/users/:userId`, `DELETE /api/v1/admin/users/:userId`, `GET /api/v1/admin/companies`, `GET /api/v1/admin/companies/:companyId`, `GET /api/v1/admin/stats` |
| Webhooks | `POST /webhooks/v1/stripe` |

## Architecture

```
server/
├── API/v1/routes/     # Route definitions per resource
├── controllers/       # Request handlers
├── models/            # Prisma data-access layer
├── middlewares/       # Auth, RBAC, CORS, rate limits, error handler
├── auth/              # Passport strategies
├── integrations/      # Stripe, Brevo, Telegram, S3
├── config/            # Logger, Stripe, PostHog, S3, Prisma client
├── cron/              # Scheduled jobs
└── webhooks/          # Stripe webhook processing
```

MVC + repository pattern: controllers handle requests, models encapsulate all database operations.

## Deployment

The included GitHub Actions workflow (`.github/workflows/`) runs the test suite, lint and the frontend build, then builds the Docker image and pushes it to Docker Hub on pushes to `latest` / `next` branches. Set `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` as repository secrets and adapt the image name to your registry.

The image runs `tini` as PID 1 and `node` directly (so `SIGTERM` triggers the graceful shutdown in `app.js`), applies pending migrations on boot (`start.sh`) and declares a `HEALTHCHECK` against `GET /health`. Build it locally with `docker build -t expressjs-template ./backend`.

### Billing safeguards

A checkout is refused with `409 SUBSCRIPTION_ACTIVE` when the stored row is an unexpired `sub_` subscription **or** Stripe reports an active, trialing or past-due subscription for the customer. An open Checkout Session for the same plan, billing cycle and price is reused (its URL is returned again); every other open session is expired before a new one is created, so at most one checkout can complete. A concurrent request Stripe is still processing answers `409 CHECKOUT_IN_PROGRESS`. Webhook writes run under the company row lock and read the subscription fresh from Stripe, so out-of-order deliveries converge on the latest state; a second access-granting subscription for a company that already tracks an active one raises a `logError` alert instead of being silently ignored.

## Stripe webhook testing

```bash
npm run stripe:listen
```

Forwards Stripe events from your test account to `http://localhost:3000/webhooks/v1/stripe`.
