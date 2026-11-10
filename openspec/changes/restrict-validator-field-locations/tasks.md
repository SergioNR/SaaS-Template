# Tasks

## 1. Pin body schemas

- [ ] 1.1 Add `in: ['body']` to `planName` and `planBillingCycle` in `backend/server/utils/validators/checkoutSessionSchema.js`; verify a validator spec case: query-only values → `failedPaths` contains both fields
- [ ] 1.2 Add `in: ['body']` to every field of `createUserSchema.js`, `userLoginValidationSchema.js`, `recoverPasswordSchema.js`, `requestNewPasswordSchema.js`, `updatePasswordSchema.js`; verify `validators.spec.js` cases per schema (value only in query → 422 path; value in body and junk in query → passes with the body value)
- [ ] 1.3 If `tests/helpers/checkQuerySchema.js` cannot drive body-located fields with a parallel query, extend it there (no local copies of the harness); verify existing validator specs stay green

## 2. Pin query schemas

- [ ] 2.1 Add `in: ['query']` to the shared fields in `listQueryFields.js` and to `role` in `adminUserListQuerySchema.js` (and any entity-specific field in `adminCompanyListQuerySchema.js`); verify `listQuerySchemas.spec.js`: a `limit` sent only in a JSON body is ignored (no 422, default applies)
- [ ] 2.2 Grep `backend/server/utils/validators/` for any field without `in` and fix it; verify `grep -L "in: \[" backend/server/utils/validators/*Schema.js` lists only files built entirely from pinned shared fields

## 3. HTTP-level regression tests

- [ ] 3.1 `appIntegration.spec.js`: `POST /api/v1/auth/login?username=<email>&password=<pw>` with no body → 422 and the strategy's user lookup is never called; verify with the mocked Prisma user lookup
- [ ] 3.2 `appIntegration.spec.js`: `POST /api/v1/billing/checkout-session?planName=pro&planBillingCycle=monthly` with `{}` body (authenticated owner) → 422, never 500; verify status and that no Stripe mock was called

## 4. Docs and validation

- [ ] 4.1 `backend/AGENTS.md` validators rule: every schema field declares `in` (`body` / `query`); path ids use `param()`; verify the rule is next to the existing validator conventions
- [ ] 4.2 Run `npm test` and `npx eslint .` in `backend/`; both clean
- [ ] 4.3 `npx -y @fission-ai/openspec@1.16.0 validate restrict-validator-field-locations --strict` passes
