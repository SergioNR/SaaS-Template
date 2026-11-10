# Proposal

## Why

A large share of the template's recent work has never been executed outside a developer laptop:

- **The workflow that holds the PR gate is disabled.** "Build Docker images and push to Docker Hub" (`.github/workflows/docker-build-push.yaml`, which also contains the `Test, lint and build` job and the `openspec validate` step) shows `disabled_manually` in the repo's Actions settings; its last run was a failed push to `latest` on 2026-10-21 (PR #53). No PR since then — including #71 — ran the gate the root `AGENTS.md` makes mandatory.
- **Docker Hub login would fail even if enabled.** The image jobs read `vars.DOCKERHUB_USERNAME` (`docker-build-push.yaml`, login and `images:` of both jobs), but the repo defines `DOCKERHUB_USERNAME` only as a *secret*; no Actions variables exist at all, so the required `VITE_API_BASE_URL` / `VITE_SITE_BASE_URL` build args (README "CI" table) are missing too, and the frontend build would fail on its own guard.
- **Environments don't match.** The image jobs run in the environment named after the branch (`latest` / `next`); the repo has `dev`, `latest` and `production` — there is no `next` environment.
- **Branch protection is off.** `latest` reports "Branch not protected"; the README recommends requiring `Test, lint and build` and `Analyze (javascript-typescript)`.
- **Untested infrastructure.** Never built or run in CI or against a real stack: the backend multi-stage image, the frontend image with its `HEALTHCHECK`, the root `compose.yaml` / `compose.dev.yaml` stacks, and the hand-written migrations `20261110090000_subscription_stripe_fields` and `20261110100000_indexes_fks_citext_emails` (data steps: moving `sub_…` ids, citext duplicate pre-check, orphan deletes, `CREATE EXTENSION citext`, which needs a role allowed to create extensions). Stripe checkout/portal/webhook flows were not re-verified after the Stripe-field migration.

No behaviour of the template changes here — this is repository configuration plus a one-time verification pass — so the change carries no spec delta (`skip_specs: true`).

## What Changes

- Re-enable the workflow; move `DOCKERHUB_USERNAME` to an Actions variable (keep or delete the secret), add the `VITE_*` variables, and create/rename the `next` environment (or set values at repository level).
- Protect `latest` and `next`: PR required, required checks `Test, lint and build` and `Analyze (javascript-typescript)`, no force-push.
- First CI run on a PR into `next`; first image push from `next`.
- Verify the images and compose stacks locally and on staging, run the two new migrations against a copy of real data, and walk the Stripe flows in test mode.
- Record findings (and fix PRs for anything broken) under this change's tasks.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none: repository settings and verification only (skip_specs) -->

## Impact

- GitHub repo settings (Actions, variables/secrets, environments, branch protection) — needs a repo admin.
- Possibly fixes in `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx/*`, `compose*.yaml`, the two migrations, or the workflow, each as its own `fix(...)` PR.
- README "CI" section if the variable/environment layout changes; stale unrelated secrets (`KOYEB_API_TOKEN`, `DOCKER_PRIVATE_REGISTRY_SECRET`) can be reviewed while there.

## Out of scope

- Squashing migrations (`squash-migrations`, which depends on this change's migration verification).
- New CI jobs (e2e, image scanning).
