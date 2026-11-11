# Tasks

## 1. Repository settings (repo admin)

- [ ] 1.1 Settings → Actions: enable "Build Docker images and push to Docker Hub"; verify `gh workflow list --all` shows it `active`
- [ ] 1.2 Create Actions variable `DOCKERHUB_USERNAME` (repository level or per environment); delete the same-named secret or leave it unused; verify `gh variable list`
- [ ] 1.3 Add variables `VITE_API_BASE_URL`, `VITE_SITE_BASE_URL` (and optionally `VITE_PUBLIC_POSTHOG_KEY`, `NEXT_VITE_*`) per the README "CI" table
- [ ] 1.4 Environments: ensure `latest` and `next` exist (create `next`; decide whether `dev`/`production` are still needed); `DOCKERHUB_TOKEN` reachable from both
- [ ] 1.5 Branch protection (or a ruleset) on `latest` and `next`: require PR, required checks `Test, lint and build` and `Analyze (javascript-typescript)`, block force-push/deletion; verify `gh api repos/{owner}/{repo}/branches/latest/protection` returns 200
- [ ] 1.6 Review stale secrets (`KOYEB_API_TOKEN`, `DOCKER_PRIVATE_REGISTRY_SECRET`) and remove if unused

## 2. First CI runs

- [ ] 2.1 Open a PR into `next`; the `Test, lint and build` job passes (backend test/lint/audit, frontend lint/test/build, `openspec validate`); fix failures in separate PRs
- [ ] 2.2 Merge into `next`; both image jobs push `next`, `next-<date>`, `next-<sha>` tags to Docker Hub; check tags on the hub

## 3. Images and stacks

- [ ] 3.1 Locally: `docker build -t tpl-api ./backend` and `docker build --build-arg VITE_API_BASE_URL=http://localhost:3000 --build-arg VITE_SITE_BASE_URL=http://localhost:8080 -t tpl-web ./frontend`; check image sizes, non-root user, `docker inspect` healthcheck
- [ ] 3.2 Root `.env` from `.env.example`; `docker compose config` and `docker compose -f compose.dev.yaml config` render without errors; database port bound to `127.0.0.1` only
- [ ] 3.3 Before CI images exist: `TAG=local docker compose -f compose.yaml -f compose.build.yaml up -d --build --wait` (builds from the checkout); afterwards `docker compose up -d --wait` (and the dev stack): all services reach `healthy`; `curl` `/health` on the API and `/` on the frontend; CSP/security headers present on the frontend responses
- [ ] 3.4 Staging host: `docker compose -f compose.dev.yaml pull && ... up -d --wait` with the CI `next` images; register, log in, open every area

## 4. Migrations against real data

The history was squashed into `0_init` (`squash-migrations`, archived). Existing databases still reach the new image through the legacy migrations - run by the last pre-squash image - so 4.1-4.4 use that image (any commit before the squash); 4.5-4.6 use the current one.

- [ ] 4.1 Restore a copy of the production (or most realistic) database into a throwaway Postgres; confirm the role can `CREATE EXTENSION citext` (or pre-create it)
- [ ] 4.2 With the pre-squash image: run the duplicate pre-checks of the legacy `20261110100000_indexes_fks_citext_emails` migration manually; resolve case-duplicate emails/invites if any
- [ ] 4.3 With the pre-squash image: `npx prisma migrate deploy` on the copy; compare row counts before/after for `User`, `Company`, `Subscription`, `TeamInvites`, `PasswordResetTokens`; confirm `sub_…` ids landed in the new Stripe column, orphan deletes removed only true orphans, and existing users got `email_verified_at`
- [ ] 4.4 `npx prisma migrate status` reports up to date on the copy
- [ ] 4.5 Current image on a fresh Postgres (the `compose.yaml` image): `migrate deploy` applies `0_init`; `npx prisma db seed` succeeds; `pg_dump --schema-only` equals that of a database built with the pre-squash image (confirms the in-process equivalence proof of `squash-migrations`)
- [ ] 4.6 Current image against the copy from 4.3: the bridge logs `[baseline] complete pre-squash history` and the app boots; against a copy with one `_prisma_migrations` legacy row deleted it refuses to start; repeat on staging

## 5. Stripe in test mode

- [ ] 5.1 Staging with Stripe test keys + `stripe listen --forward-to`: trial company → checkout with a test card → webhook marks paid; portal opens for a company with a billing id; cancellation in the portal syncs; company deletion tears down billing
- [ ] 5.2 Note any discrepancy against the `billing` spec and open fixes

## 6. Brevo templates (per environment, dashboard access)

From the archived `fix-auth-registration-gaps` (1.1, 1.4) and `add-email-verification` (5.2): emailed links are now built in code and passed as full-URL params.

- [ ] 6.1 Record what link the live reset and invite templates use today; confirm none links to `/auth/reset-password`
- [ ] 6.2 Switch the reset template to `{{ params.resetPasswordUrl }}` and the invite template to `{{ params.acceptInviteUrl }}`
- [ ] 6.3 Create the email-verification template (`{{ params.emailVerificationUrl }}`) and set `BREVO_VERIFY_EMAIL_TEMPLATE_ID` - deployed environments refuse to boot without it

## 7. Manual checks the 2026-11-10/11 batches could not run

Each is covered by automated specs; these confirm the behaviour against real infrastructure. Details in each archived change's `tasks.md` under `changes/archive/`.

- [ ] 7.1 Database: `npx prisma db seed` gives verified seed accounts (`add-email-verification` 1.2); admin lists - filter, sort and walk two pages on a seeded DB (`filterable-admin-lists` 4.3)
- [ ] 7.2 Two API replicas on one database: one session-prune tick per slot (`share-cron-alert-state-across-replicas` 3.2); with `RATE_LIMIT_STORE=postgres` the 11th auth request across both answers 429 (`distributed-rate-limits` 3.3)
- [ ] 7.3 Logs and alerts: access line `reqId` equals `X-Request-Id` (`fix-access-log-request-id` 2.2); unreachable database → alert shows the error code (`include-error-code-in-alerts` 4.2); unhandled rejection → alert arrives before exit (`harden-process-lifecycle` 3.2)
- [ ] 7.4 Telegram business events with a test bot: register, accept an invite, Stripe test checkout and cancel, delete the account → one message each, no emails or ids (`add-telegram-business-events` 4.1)
- [ ] 7.5 Email verification end to end with Brevo: register → email → verify → login; squatted address claimed by invite and by reset (`add-email-verification` 7.2)
- [ ] 7.6 Browser: session caches reset across two logins on one tab (`fix-session-cache-invalidation-gaps` 3.2); PostHog test key - consent reset from the sidebar and superadmin identify (`consent-controls-everywhere` 3.2); backend stopped on `/dashboard` → error with retry (`show-billing-load-errors` 4.2); two-superadmin seed - password change, self-deletion, last-superadmin refusal on `/admin/account` (`superadmin-self-service` 4.3)

## 8. Close-out

- [ ] 8.1 Update README "CI" if variables/environments changed; tick these tasks with links to the runs/PRs
