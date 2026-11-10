# Tasks

## 1. Backend registry

- [ ] 1.1 Add `backend/server/utils/adminColumnFilters.js`: filter types `enum`, `ref` (UUID), `boolean`, `dateRange` (`<param>_from`/`<param>_to`, inclusive UTC days, either bound alone) and the per-list declarations for `users` and `companies`; pure builders for the Prisma `where` fragment, `checkSchema` rules and OpenAPI parameters; unit spec per type (valid, invalid, open-ended range, inverted range → 422)
- [ ] 1.2 Add `backend/server/utils/adminColumnSorts.js`: per-list sort whitelist, `order` ∈ asc/desc (default asc), `nulls: 'last'` for nullable columns, `id` tiebreaker in the same direction; default stays `DEFAULT_LIST_ORDER`; unit spec (unknown key → error, default order, nullable column)
- [ ] 1.3 `utils/cursorPagination.js`: `listPaginationArgs(pagination, orderBy = DEFAULT_LIST_ORDER)`; keep `cursorPagination.spec.js` green

## 2. Wire the admin lists

- [ ] 2.1 `utils/validators/adminUserListQuerySchema.js` / `adminCompanyListQuerySchema.js`: spread the generated rules (keep `search`, pagination, and the existing `role` messages)
- [ ] 2.2 `controllers/adminController.js` + `models/userModel.js` / `companyModel.js`: AND filter fragments with the search clause on both page and count queries; apply the sort; 422 on unknown sort; verify in `adminController.spec.js` and `adminModels.spec.js` (count matches filtered rows; cursor walk across a page boundary under each sort, including null `last_login_at`)
- [ ] 2.3 OpenAPI: emit the generated parameters for both list routes; `openapiCoverage.spec.js` asserts every registry param is documented
- [ ] 2.4 Decide the `User(last_login_at, id)` index (design open question); if added, ship the migration with `prisma migrate dev --create-only` and review the SQL

## 3. SPA

- [ ] 3.1 New `frontend/src/components/AdminFilterPanel.jsx` + pure `adminFilterValues.js` (staged vs applied state, active count, clear, revert); spec for the pure helpers and the panel (no request while editing, one per apply)
- [ ] 3.2 `AdminUsersList.jsx` / `AdminCompaniesList.jsx`: render the panel above the table, sortable headers (`aria-sort`) for whitelisted columns, filters + sort mirrored in the URL query; `useCursorList` reloads from the first page when they change; 422 → inline error
- [ ] 3.3 `es.json` keys for filter labels, sort labels, apply/clear/revert

## 4. Docs and verification

- [ ] 4.1 `backend/AGENTS.md`: document the registry as the only place to add admin list filters/sorts; `frontend/AGENTS.md`: reference `AdminFilterPanel` next to `useCursorList`
- [ ] 4.2 `npm test` + `npx eslint .` in `backend/`; `npm test`, `npm run lint`, `npm run build` in `frontend/`
- [ ] 4.3 Manual on a seeded DB: filter users by company and last-login range, sort by email desc, walk two pages; companies `stripe_linked=true` sorted by name
- [ ] 4.4 `npx -y @fission-ai/openspec@1.16.0 validate filterable-admin-lists --strict` passes
