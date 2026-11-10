# Design

## Context

Admin lists are cursor-paginated newest first (`DEFAULT_LIST_ORDER` = `created_at desc, id desc`) through `listPaginationArgs()`; filters today are a `search` substring and the users `role` enum, validated by `checkSchema` schemas built from `listQueryFields.js`. OpenAPI parameters live in JSDoc blocks and `tests/openapiCoverage.spec.js` checks route coverage. Wesel's registry (`crmColumnFilters.js` ~300 lines, `crmColumnSorts.js` ~60 lines) is CRM-specific in its column lists but generic in its types and helpers.

## Decisions

### One registry, three outputs

Each list declares `{ param, type, field, values? }` entries. Pure functions turn the active query into (1) a Prisma `where` fragment, (2) `checkSchema` rules, (3) OpenAPI parameter objects. The controller ANDs the fragments with the search clause onto both `findMany` and `count`, so `userCount`/`companyCount` match the rows. Recommended: port only the types the admin lists need (`enum`, `ref`, `boolean`, `dateRange`) instead of all of Wesel's (`numberRange`, `multiCatalog`, …) — less surface, the registry stays extendable.

### Sorting under cursor pagination

Options:
- **A. Sort column + `id` tiebreaker in the same direction, keep Prisma `cursor` (recommended).** What Wesel does; Prisma resolves the cursor position through the `orderBy`, so the walk is consistent as long as the order is total. Cheap; nullable columns need care (below).
- B. Encode the sort key into an opaque cursor (keyset `(value, id) > (...)`). More robust against concurrent inserts and null handling, but changes the `cursor` contract (UUID today) — rejected for now.
- C. Offset pagination when sorted. Rejected: two pagination contracts in one endpoint.

Nullable `last_login_at`: Prisma supports `{ sort, nulls: 'last' }`; the cursor walk must use the same null placement on every page. Pin with a spec that walks a page boundary across null and non-null rows.

### Unknown keys

Unknown `sort` → 422 (a typo silently falling back to newest-first misleads the operator); unknown filter parameters stay ignored, per the existing whitelist requirement.

### SPA

Port Wesel's always-visible panel (Mantine 9 controlled `Popover.Target` no longer attaches `onClick`, which is why Wesel moved away from a popover): staged state inside the panel component, the table re-renders only on apply. Filters and sort live in the URL query string so a filtered view can be shared/bookmarked; `useCursorList` resets the cursor whenever they change.

## Risks / Trade-offs

- Sorting by `email` (citext) or `name` (nullable) without an index → sequential scans on large tenants; acceptable for an admin tool, revisit with `EXPLAIN` on a realistic dataset.
- Generated validators make the query contract less visible in the router; mitigated by the generated OpenAPI parameters.

## Open questions

- Should companies be filterable by subscription state (paid / trial / inactive)? It is derived (`is_paid` + `expires_at`), so it needs a hand-written fragment, and its semantics depend on `clarify-subscription-paid-state`.
- Should users be filterable by company role (owner/admin/member)? Requires a `UserRole` relation filter.
- Is a `User(last_login_at, id)` index worth a migration now, or only once a product reports slow lists?
