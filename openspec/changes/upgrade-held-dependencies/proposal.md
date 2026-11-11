# Proposal

## Why

The 2026-11-10 dependency pass (`chore(deps)` commits `8a93074`, `498af66`) updated both packages within their current majors and deliberately held back the following, under the 7-day release-cooldown policy or because of a blocker:

| Package | Current | Target | Why held |
| --- | --- | --- | --- |
| `i18next` (frontend) | ^26.7.1 | 27.x | New major released 2026-11-07 — inside the 7-day cooldown |
| `react-i18next` (frontend) | ^17.1.11 | 18.x | Same; must move together with `i18next` 27 |
| `eslint`, `@eslint/js` (frontend) | ^9.18.0 | 10.x | Blocked: `eslint-plugin-react@7.37.5` peer range caps at `^9.7` (backend is already on ESLint 10) |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` (backend) | ^7.10.1 | 8.x | Only release candidates published (`latest` dist-tag is `8.0.0-rc.33`); wait for GA |
| `@logtail/pino` (backend) | ^0.5.13 | 0.6.x | 0.x minor = potentially breaking; not reviewed yet |
| `swagger-jsdoc` (backend) | 6.3.0 | replace — **done 2026-11-11** (in-repo extractor, task group 5) | Unmaintained line; pins `glob@11.1.0` (and its `minimatch`), which carry moderate advisories; the only "next" line is a 2021 `7.0.0-rc` |

`prop-types` stays a dependency only because `eslint-plugin-react`'s `react/prop-types` rule demands it (`frontend/AGENTS.md`); React 19 ignores `propTypes`. If the plugin is replaced to unblock ESLint 10, that justification should be revisited in the same change.

No runtime behaviour should change — each upgrade is verified against the existing tests and specs — so the change carries no spec delta (`skip_specs: true`). If an upgrade turns out to change observable behaviour, that piece gets its own change with a delta.

## Status (2026-11-11)

Group 5 (swagger-jsdoc) is applied. The rest is waiting on dates or upstream releases, which is why this change stays open:

| Group | Unblocks when |
| --- | --- |
| 1. i18next 27 + react-i18next 18 | 2026-11-14 (7 days after the 2026-11-07 release) |
| 2. Frontend ESLint 10 | `eslint-plugin-react` supports ESLint 10 (latest `7.37.5` still caps at `^9.7`), or option B/C is chosen |
| 3. Prisma 8 | 8.0.0 GA + 7 days (`latest` dist-tag is still `8.0.0-rc.33`) |
| 4. `@logtail/pino` 0.6 | 0.6.1 clears the cooldown on 2026-11-13 (0.6.0 on 2026-11-12) |

## What Changes

- Upgrade `i18next` + `react-i18next` together once past cooldown, after reading both changelogs.
- Unblock frontend ESLint 10: wait for an `eslint-plugin-react` release supporting ESLint 10, or replace it (see design.md); then decide whether `prop-types` + `react/prop-types` stay.
- Upgrade Prisma to 8 once GA, regenerate the client, review the upgrade guide (driver adapters, `prisma.config.ts`, generated output path).
- Upgrade `@logtail/pino` to 0.6 after reviewing transport options.
- Replace `swagger-jsdoc` (see design.md), keeping the generated OpenAPI document identical.
- Each package lands as its own `chore(deps)` (or `chore(deps)!`) PR.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

<!-- none: dependency upgrades only (skip_specs) -->

## Impact

- `frontend/package.json` + lockfile, `frontend/eslint.config.js`, possibly every component's `propTypes`, `frontend/src/i18n/index.js`, `frontend/AGENTS.md` (stack section).
- `backend/package.json` + lockfile, `backend/prisma.config.ts`, `backend/prisma/schema.prisma` generator block, `backend/server/config/prismaClient.js`, `backend/server/config/logger.js` (Logtail transport), `backend/server/config/swagger.js` + `tests/openapiCoverage.spec.js` / `docsRouter.spec.js`, `backend/AGENTS.md`.
- Docker images rebuild with the new dependencies (CI must be enabled — `enable-ci-and-first-verification`).

## Out of scope

- Upgrades that Dependabot handles within current majors.
- React, Vite, Mantine or Express majors (none pending).
