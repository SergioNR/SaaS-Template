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
- [ ] 3.3 `docker compose up -d --wait` (and the dev stack): all services reach `healthy`; `curl` `/health` on the API and `/` on the frontend; CSP/security headers present on the frontend responses
- [ ] 3.4 Staging host: `docker compose -f compose.dev.yaml pull && ... up -d --wait` with the CI `next` images; register, log in, open every area

## 4. Migrations against real data

- [ ] 4.1 Restore a copy of the production (or most realistic) database into a throwaway Postgres; confirm the role can `CREATE EXTENSION citext` (or pre-create it)
- [ ] 4.2 Run the duplicate pre-checks of `20261110100000_indexes_fks_citext_emails` manually; resolve case-duplicate emails/invites if any
- [ ] 4.3 `npx prisma migrate deploy` on the copy; compare row counts before/after for `User`, `Company`, `Subscription`, `TeamInvites`, `PasswordResetTokens`; confirm `sub_…` ids landed in the new Stripe column and orphan deletes removed only true orphans
- [ ] 4.4 `npx prisma migrate status` reports up to date; `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma` is empty

## 5. Stripe in test mode

- [ ] 5.1 Staging with Stripe test keys + `stripe listen --forward-to`: trial company → checkout with a test card → webhook marks paid; portal opens for a company with a billing id; cancellation in the portal syncs; company deletion tears down billing
- [ ] 5.2 Note any discrepancy against the `billing` spec and open fixes

## 6. Close-out

- [ ] 6.1 Update README "CI" if variables/environments changed; tick these tasks with links to the runs/PRs
