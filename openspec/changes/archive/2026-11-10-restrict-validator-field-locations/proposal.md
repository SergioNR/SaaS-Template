# Proposal

## Why

`checkSchema(...)` validates a field in **every** request location (body, cookies, headers, params, query) unless the schema says `in: [...]`, while controllers read one location only. Six schemas omit `in`, so validation and the handler can see different values:

- `checkoutSessionSchema` (`backend/server/utils/validators/checkoutSessionSchema.js`) - `POST /api/v1/billing/checkout-session?planName=pro&planBillingCycle=monthly` with an empty body passes validation, then `billingController.js:85` reads `req.body.planName` as `undefined` and the price lookup fails as a **500** instead of a 422.
- `createUserValidationSchema`, `userLoginValidationSchema`, `recoverPasswordSchema`, `requestNewPasswordSchema`, `updatePasswordSchema` - credentials and emails validate from the query string too. passport-local reads `req.body` **then `req.query`** (`lookup(req.body, field) || lookup(req.query, field)`), so `POST /api/v1/auth/login?username=...&password=...` with an empty body can authenticate. Credentials in URLs end up in browser history, proxy logs and `Referer` headers - the access log strips queries, but nothing upstream of us does.
- The list-query schemas (`listQueryFields.js`, `filesListQuerySchema.js`, `adminUserListQuerySchema.js`, `adminCompanyListQuerySchema.js`) have the mirror problem: a JSON body on a GET could satisfy (or fail) validation for a value the controller reads from `req.query`.

## What Changes

- Every validator schema pins each field to the location its controller reads: body fields `in: ['body']`, list filters / tokens `in: ['query']` (the token schemas already do), path ids stay on `param()`.
- A body field supplied only in the query (or vice versa) counts as missing → **422** with the standard validation shape. A copy in another location is ignored.
- Login can no longer authenticate from query-string credentials: validation now requires `username`/`password` in the body, so passport's body lookup always wins. A regression test pins it.
- Checkout with query-only plan fields answers 422, never 500.
- No new routes, env vars or migrations. Clients already send JSON bodies (the SPA never uses query credentials).

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `api-hardening`: new requirement that validated fields come from exactly one location.
- `auth`: new requirement that login credentials are accepted only from the JSON body.
- `billing`: checkout input requirement names the body and the 422 for query-only values.

## Impact

- `backend/server/utils/validators/*.js` - add `in` to every field of `checkoutSessionSchema`, `createUserSchema`, `userLoginValidationSchema`, `recoverPasswordSchema`, `requestNewPasswordSchema`, `updatePasswordSchema`, and `in: ['query']` to the shared list-query fields and list schemas.
- Routes affected (behaviour only): `POST /api/v1/auth/login`, `POST /api/v1/auth/register`, `POST|PATCH /api/v1/auth/password-reset`, `PATCH /api/v1/user/password`, `PATCH /api/v1/auth/update-user-password`, `POST /api/v1/billing/checkout-session`, `GET /api/v1/files`, `GET /api/v1/admin/users`, `GET /api/v1/admin/companies`.
- Tests: `backend/tests/validators.spec.js`, `listQuerySchemas.spec.js`, `appIntegration.spec.js` (login + checkout over HTTP), `tests/helpers/checkQuerySchema.js` may need a body-location helper.
- `backend/AGENTS.md` validator rule (every schema field declares `in`).
- No env, no migration, no OpenAPI change (the docs already describe these as body/query fields).

## Out of scope

- Replacing passport-local or its field lookup (body-only validation makes the query fallback unreachable).
- Rejecting requests that carry *unknown* extra query parameters (they stay ignored).
- `acceptTeamInviteSchema`, `createTeamInviteSchema`, `updateMemberRoleSchema`, `createFileUploadSchema` and the token query schemas - already pinned.
