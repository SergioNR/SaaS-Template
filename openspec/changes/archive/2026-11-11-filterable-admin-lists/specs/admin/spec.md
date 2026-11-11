# Spec Delta

## ADDED Requirements

### Requirement: Admin list filters and sorts are documented

Every filter and sort parameter accepted by the admin user and company lists SHALL be listed, with its allowed values or format, in the API documentation for that endpoint, and no list SHALL accept a filter or sort parameter that is not documented.

#### Scenario: Filter parameter documented

- **WHEN** the API documentation is opened on local development
- **THEN** the admin users list documents `company_id`, the created and last-login date ranges, `sort` with its allowed keys and `order`

### Requirement: SPA admin list filters and sorting

The admin users and companies pages SHALL render a filter panel above the table whose edits send no request until applied, then exactly one; SHALL show the number of applied filters and offer to clear them; SHALL let the operator sort by each sortable column from its header, exposing the current sort to assistive technology; and SHALL restart the list from its first page whenever filters or sort change.

#### Scenario: Staged filter edits

- **WHEN** the operator changes two filters in the panel and then applies
- **THEN** no list request is sent while editing and exactly one is sent on apply, from the first page

#### Scenario: Sort from a header

- **WHEN** the operator activates the email column header on the users page
- **THEN** the list reloads sorted by email and the header announces its sort direction

## MODIFIED Requirements

### Requirement: Admin lists use cursor pagination

The system SHALL paginate the admin user and company lists newest first (creation time, then row id, descending) or by the requested sort column with the row id as same-direction tiebreaker, with an optional `limit` (integer 1–100, default 50) and `cursor` (UUID of the previous page's last row). Responses SHALL carry the rows, the count of rows matching the filters, and a `nextCursor` (last row's id) only when the page is full. Invalid `limit` or `cursor` SHALL answer 422.

#### Scenario: Full page has a next cursor

- **WHEN** a superadmin lists with `limit=2` and at least three rows match
- **THEN** two rows are returned and `nextCursor` is the id of the second row

#### Scenario: Walking to the next page

- **WHEN** the superadmin repeats the request with `cursor` set to the previous `nextCursor`
- **THEN** the rows that follow that row in the requested order are returned, without repeating it

#### Scenario: Walking a sorted list

- **WHEN** a superadmin walks every page of the users list sorted by `last_login_at`
- **THEN** each matching user appears exactly once, in that order, with never-logged-in users last

#### Scenario: Last page

- **WHEN** fewer rows than `limit` remain
- **THEN** the response carries no `nextCursor`

#### Scenario: Invalid pagination input

- **WHEN** `limit` is 0, above 100 or not an integer, or `cursor` is not a UUID
- **THEN** the API responds 422 with `errors`

### Requirement: Admin list search and filter whitelist

The system SHALL accept an optional `search` query on the admin lists (string, trimmed, at most 100 characters, otherwise 422) that matches case-insensitively as a substring, SHALL accept `sort` only with a key whitelisted for that list and `order` only as `asc` or `desc`, answering 422 otherwise, and SHALL ignore every other query parameter outside the documented set instead of passing it to the database.

#### Scenario: Search too long

- **WHEN** `search` exceeds 100 characters
- **THEN** the API responds 422

#### Scenario: Unknown sort key

- **WHEN** a list request carries `sort=password`
- **THEN** the API responds 422 with `errors` and no list query runs

#### Scenario: Unknown query parameter ignored

- **WHEN** a list request carries a query parameter that is not documented for the endpoint
- **THEN** it has no effect on the result

### Requirement: User list

The system SHALL answer `GET /api/v1/admin/users` with 200 and `{ userCount, users, nextCursor }`, each row carrying the account fields minus the password hash plus its company's `id` and `name` (null without one). `search` SHALL match the email; optional filters SHALL be `role` (`user` or `superadmin`), `company_id` (UUID) and inclusive creation and last-login date ranges (either bound alone); `sort` SHALL accept `email`, `created_at`, `last_login_at`. Invalid filter values SHALL answer 422.

#### Scenario: Email search

- **WHEN** a superadmin lists users with `search=acme`
- **THEN** only users whose email contains `acme` case-insensitively are returned and `userCount` counts only them

#### Scenario: Role filter

- **WHEN** a superadmin lists users with `role=superadmin`
- **THEN** only superadmin accounts are returned

#### Scenario: Invalid role filter

- **WHEN** `role` is anything other than `user` or `superadmin`
- **THEN** the API responds 422

#### Scenario: Company and last-login filters combine

- **WHEN** a superadmin lists users with a `company_id` and a last-login upper bound 90 days ago
- **THEN** only that company's users last seen on or before that day are returned and `userCount` counts only them

#### Scenario: Inverted date range

- **WHEN** a date range's lower bound is after its upper bound, or a bound is not a valid date
- **THEN** the API responds 422

#### Scenario: No password hash

- **WHEN** any user row is returned
- **THEN** it never contains the password hash

### Requirement: Company list

The system SHALL answer `GET /api/v1/admin/companies` with 200 and `{ companyCount, companies, nextCursor }`, where `search` matches the company name and each row carries the company fields, member count `userCount`, a `stripeLinked` boolean and its subscription (`created_at`, `updated_at`, `expires_at`, `status`, `is_paid`) or null. Optional filters SHALL be `stripe_linked` (`true`/`false`) and an inclusive creation date range; `sort` SHALL accept `name` and `created_at`. No Stripe customer or subscription id SHALL be exposed.

#### Scenario: Name search

- **WHEN** a superadmin lists companies with `search=acme`
- **THEN** only companies whose name contains `acme` case-insensitively are returned and `companyCount` counts only them

#### Scenario: Stripe-linked filter

- **WHEN** a superadmin lists companies with `stripe_linked=true`
- **THEN** only companies with a Stripe customer are returned and `companyCount` counts only them

#### Scenario: Billing identifiers hidden

- **WHEN** a listed company has a Stripe customer
- **THEN** its row shows `stripeLinked: true` and no Stripe id

#### Scenario: Paid and trial rows distinguishable

- **WHEN** the list holds a paying company and a trial company
- **THEN** their subscriptions read `status: paid` and `status: trial` respectively
