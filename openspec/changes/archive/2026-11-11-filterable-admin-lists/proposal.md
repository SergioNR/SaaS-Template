# Proposal

> **Optional / nice-to-have.** No defect behind this change; pick it up when an operator needs more than email/name search and the role filter. It is a feature for the template's admin area and a reusable pattern for products built on it.

## Why

The admin users and companies lists offer one free-text search each plus a single `role` filter on users (`backend/server/utils/validators/adminUserListQuerySchema.js`, `adminCompanyListQuerySchema.js`) and a fixed newest-first order (`utils/cursorPagination.js` `DEFAULT_LIST_ORDER`). An operator cannot answer "which companies have a Stripe customer?", "who has not logged in for 90 days?" or "users of company X, oldest first" without database access. Adding filters ad hoc would scatter each one over four places that must agree — the Prisma `where`, the query validator, the OpenAPI parameters (checked by `tests/openapiCoverage.spec.js`) and the SPA controls — which is how they drift.

Wesel (a product forked from this template) solved the same problem with a declarative per-column registry: one declaration per column generates the Prisma fragment, the express-validator rules and the OpenAPI parameters, and a sort whitelist rejects unknown sort keys with 422 (`Wesel/backend/server/utils/crmColumnFilters.js`, `crmColumnSorts.js`; SPA filter panel in Wesel commit `e33ac9e`). This change ports the generic part of that pattern to the admin lists.

## What Changes

- Backend: a declarative admin column registry (filter types `enum`, `ref`, `boolean`, `dateRange`) and a sort whitelist per list; the list controllers AND the active filter fragments onto both the page and the count query; the query validators and the OpenAPI parameters are generated from the same registry.
- `GET /api/v1/admin/users` gains: `company_id` (UUID), `created_from`/`created_to`, `last_login_from`/`last_login_to` (ISO dates, inclusive days; either bound alone), plus `sort` ∈ {`email`, `created_at`, `last_login_at`} and `order` ∈ {`asc`, `desc`}. `role` keeps its current behaviour.
- `GET /api/v1/admin/companies` gains: `stripe_linked` (`true`/`false`), `created_from`/`created_to`, plus `sort` ∈ {`name`, `created_at`} and `order`.
- An unknown `sort` key, an invalid `order`, a malformed date or an inverted range answers 422. Other undocumented parameters stay ignored.
- Cursor pagination keeps working under any sort (sort column + row id tiebreaker, same direction).
- SPA: an always-visible filter panel above each admin list table (staged edits, one request per apply, active-filter count, clear), and sortable column headers for the whitelisted columns.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `admin`: pagination order becomes sortable; the search/filter whitelist requirement covers `sort`/`order` validation; the user and company list requirements gain their filters; a new requirement covers the SPA filter panel and sortable headers.

## Impact

- Backend: new `server/utils/adminColumnFilters.js` + `adminColumnSorts.js` (registry), `utils/cursorPagination.js` (orderBy parameter), `utils/validators/adminUserListQuerySchema.js` / `adminCompanyListQuerySchema.js` (generated rules), `controllers/adminController.js`, `models/userModel.js` / `companyModel.js` (where/orderBy), swagger parameters in `API/v1/routes/admin/usersRouter.js` / `companiesRouter.js` or the shared swagger config.
- Possibly a DB index for `last_login_at` sorting (`User(last_login_at, id)`) — migration required if added.
- Frontend: `pages/admin/AdminUsersList.jsx`, `AdminCompaniesList.jsx`, new `components/AdminFilterPanel.jsx` + pure `adminFilterValues.js`, `hooks/useCursorList.js` (pass filter/sort params), `es.json`.
- Tests: registry unit specs, `listQuerySchemas.spec.js`, `adminController.spec.js`, `adminModels.spec.js`, `openapiCoverage.spec.js`; SPA specs for the panel and lists.
- Coordination: `restrict-validator-field-locations` (backend) changes how validators bind to `query`; build the generated rules on top of it.

## Out of scope

- Filtering on derived/aggregate values (member count, subscription paid/trial state) — see design open questions.
- Saved views, CSV export, multi-column sort.
- The files list (`GET /api/v1/files`), which keeps its current contract.
