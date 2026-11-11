# Tasks

## 1. Backend

- [x] 1.1 Invite-claim deletion posts `notifyUserDeleted(claimedDeletion, 'system')` after commit; `system` actor reads "automatic cleanup (unverified account)"
- [x] 1.2 Purge passes `actorKind: 'system'`; rethrows `isTransientDatabaseError` / `isShuttingDown()` failures, logs others per account
- [x] 1.3 `notifyCompanyRegistered` before `issueEmailVerification`
- [x] 1.4 `verificationEmailLimiter` spreads `sharedCredentialLimiterOptions('verifyemail:')`
- [x] 1.5 `frontendUrl` in `utils/frontendUrl.js`; Stripe success/cancel/portal URLs use it
- [x] 1.6 Specs: claim event, purge rethrow (transient + shutdown), registration event survives a verification failure, system actor text, Stripe URLs with a trailing-slash / path origin

## 2. Frontend

- [x] 2.1 h2 "Mi perfil" on `/user/profile`, h2 "Facturación" on `/user/billing` in loading, error and loaded states (specs)
- [x] 2.2 409 `CHECKOUT_IN_PROGRESS` → `billing.errors.checkoutInProgress` toast (spec; other 409s unchanged)
- [x] 2.3 `subscriptionStatus` from `status` only; badge `paid` → "Activa"; `billing.statusPaid` and three unused keys removed (specs)
- [x] 2.4 Named exports on the eight default-only components; `LoginForm` reads `e.currentTarget.elements`

## 3. Docs and infrastructure

- [x] 3.1 `backend/AGENTS.md`:
  - token rules cover email verification and Stripe URLs;
  - shared limiter list;
  - deletion paths;
  - `system` actor;
  - the per-item cron rethrow rule;
  - `start.sh` runs the bridge first.
- [x] 3.2 `backend/README.md` email-verification routes and limits; `RATE_LIMIT_STORE` row; `backend/.env.example` comment; seed comment points at `0_init`
- [x] 3.3 Root `.env.example` deploy checklist lists every boot-required variable
- [x] 3.4 `frontend/AGENTS.md`: components, `src/config/`, sections, `e.currentTarget.elements`
- [x] 3.5 `compose.build.yaml` overlay; CSP runtime variables in both stacks; `docker compose config` renders all three variants
- [x] 3.6 Backend `npm test` + `npx eslint .`; frontend lint, test, build; `openspec validate --strict`
