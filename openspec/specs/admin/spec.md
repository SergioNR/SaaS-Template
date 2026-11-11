# admin Specification

## Purpose
Owns the platform-operator area under `/api/v1/admin` and its SPA counterpart under `/admin`: the superadmin-only gate, cursor-paginated user and company lists with search and filters, user and company detail reads, platform stats, admin-initiated user deletion with its self-, last-superadmin- and last-owner guards, and the audit trail of admin deletions.

## Requirements

### Requirement: Admin area is superadmin-only

The system SHALL require an authenticated session with the platform role `superadmin` for every route under `/api/v1/admin`: no session SHALL receive 401 and any other platform role SHALL receive 403, both with an empty JSON body. Company roles SHALL grant nothing here. Unknown paths under `/api/v1/admin` SHALL answer the JSON 404 route-not-found body once the caller passed the gate.

#### Scenario: Anonymous caller

- **WHEN** a request without a session calls any `/api/v1/admin` route
- **THEN** the API responds 401 with `{}`

#### Scenario: Tenant user rejected

- **WHEN** an authenticated user with platform role `user` (whatever their company role) calls any `/api/v1/admin` route
- **THEN** the API responds 403 with `{}`

#### Scenario: Unknown admin route

- **WHEN** a superadmin calls a path under `/api/v1/admin` that matches no route
- **THEN** the API responds 404 with the route-not-found `message`

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

### Requirement: User detail

The system SHALL answer `GET /api/v1/admin/users/:userId` with 200 and `{ user }`: the account fields without the password hash, an `activeSessionCount` (unexpired sessions), and a `company` (null without one) holding `id`, `name`, a `stripeLinked` boolean instead of the Stripe customer id, and its `subscription` dates or null. Session contents SHALL never be exposed. A malformed id SHALL answer 422 and an unknown id 404 with `{}`.

#### Scenario: Existing user

- **WHEN** a superadmin requests an existing user's detail
- **THEN** the API responds 200 with the user, its company summary and its active session count

#### Scenario: Stripe customer id hidden

- **WHEN** the user's company has a Stripe customer
- **THEN** the detail shows `stripeLinked: true` and never the customer id

#### Scenario: Unknown user

- **WHEN** the id is a well-formed UUID that matches no user
- **THEN** the API responds 404 with `{}`

#### Scenario: Malformed id

- **WHEN** the id is not a UUID
- **THEN** the API responds 422

### Requirement: Company list

The system SHALL answer `GET /api/v1/admin/companies` with 200 and `{ companyCount, companies, nextCursor }`, where `search` matches the company name and each row carries the company fields, member count `userCount`, a `stripeLinked` boolean and its subscription dates (`created_at`, `updated_at`, `expires_at`) or null. Optional filters SHALL be `stripe_linked` (`true`/`false`) and an inclusive creation date range; `sort` SHALL accept `name` and `created_at`. No Stripe id SHALL be exposed.

#### Scenario: Name search

- **WHEN** a superadmin lists companies with `search=acme`
- **THEN** only companies whose name contains `acme` case-insensitively are returned and `companyCount` counts only them

#### Scenario: Stripe-linked filter

- **WHEN** a superadmin lists companies with `stripe_linked=true`
- **THEN** only companies with a Stripe customer are returned and `companyCount` counts only them

#### Scenario: Billing identifiers hidden

- **WHEN** a listed company has a Stripe customer
- **THEN** its row shows `stripeLinked: true` and no Stripe id

### Requirement: Company detail

The system SHALL answer `GET /api/v1/admin/companies/:companyId` with 200 and `{ company }` carrying the company fields, `stripeLinked`, its subscription dates or null, and its members (`id`, `email`, `role`, `created_at`, `last_login_at`, newest first), without any Stripe id. A malformed id SHALL answer 422 and an unknown id 404 with `{}`.

#### Scenario: Company detail

- **WHEN** a superadmin requests an existing company
- **THEN** the API responds 200 with the company, its subscription dates and its members

#### Scenario: Unknown company

- **WHEN** the id is a well-formed UUID that matches no company
- **THEN** the API responds 404 with `{}`

### Requirement: Platform stats

The system SHALL answer `GET /api/v1/admin/stats` with 200 and a `stats` object holding `totalUsers`, `totalSuperadmins`, `newUsersLastWeek` (accounts created in the last 7 days), `totalCompanies`, `totalSubscriptions`, `activeSubscriptions` (subscriptions whose `expires_at` is in the future) and `activeSessions` (unexpired sessions).

#### Scenario: Stats read

- **WHEN** a superadmin requests the stats
- **THEN** the API responds 200 with all seven counters

### Requirement: Admin user deletion

The system SHALL let a superadmin delete another account with `DELETE /api/v1/admin/users/:userId`, answering 200 with `{ userId }`. The account, its sessions and the invites it issued SHALL be removed in one transaction. Company rank rules SHALL NOT apply to a superadmin. A malformed id SHALL answer 422; an unknown id, or a user removed concurrently, 404 with `{}`; a deletion blocked by rows still referencing the user, 409 with a `message` and no `code`.

#### Scenario: Member deleted

- **WHEN** a superadmin deletes a company member while other members remain
- **THEN** the API responds 200 with the deleted `userId`, the user's sessions are revoked and the company is kept

#### Scenario: Unknown user

- **WHEN** the id matches no user
- **THEN** the API responds 404 with `{}`

### Requirement: Deleting a company's last member removes the company

When the deleted account was the last member of its company, the system SHALL remove the company with its subscription, invites and file catalog in the same transaction, and after the commit SHALL expire the company's open checkouts, cancel its access-granting subscriptions at period end and remove its stored files — best-effort, never turning the committed deletion into an error response.

#### Scenario: Last member deleted

- **WHEN** a superadmin deletes the only member of a company
- **THEN** the company and its data are removed, and its billing and stored files are cleaned up after the commit

#### Scenario: Billing provider outage

- **WHEN** the post-commit billing or storage cleanup fails
- **THEN** the API still responds 200 and the failure is logged

### Requirement: Admin deletion keeps the last company owner

The system SHALL refuse an admin deletion of the only `company_owner` of a company that still has other members, answering 409 with `code: LAST_COMPANY_OWNER`.

#### Scenario: Last owner with other members

- **WHEN** the target is the only owner of a company that still has other members
- **THEN** the API responds 409 with `code: LAST_COMPANY_OWNER` and nothing is deleted

### Requirement: Superadmins cannot delete themselves from the admin area

The system SHALL reject `DELETE /api/v1/admin/users/:userId` with 409 (a `message` pointing to the self-service user endpoint, no `code`) when the target is the calling superadmin.

#### Scenario: Self-deletion attempt

- **WHEN** a superadmin targets their own id on the admin delete endpoint
- **THEN** the API responds 409 and the account is kept

### Requirement: The platform keeps at least one superadmin

The system SHALL refuse to delete the last remaining superadmin through either the admin or the self-service deletion endpoint, answering 409 with `code: LAST_SUPERADMIN`. The check SHALL be serialized so two concurrent deletions of the last two superadmins cannot both succeed.

#### Scenario: Last superadmin

- **WHEN** a deletion targets the only superadmin account
- **THEN** the API responds 409 with `code: LAST_SUPERADMIN` and the account is kept

#### Scenario: Concurrent deletion of the last two

- **WHEN** two deletions of the only two superadmins run at the same time
- **THEN** exactly one succeeds and the other responds 409 with `code: LAST_SUPERADMIN`

### Requirement: Admin deletions are audited

The system SHALL emit an `admin.user.deleted` audit line (entity `user`, the deleted id) for every successful admin deletion, carrying the acting superadmin's id as the line's user id, plus an `admin.company.deleted` line (entity `company`, the company id) when the company was removed. Refused or failed deletions SHALL emit no admin audit line.

#### Scenario: Audit on success

- **WHEN** a superadmin deletes the last member of a company
- **THEN** both `admin.user.deleted` and `admin.company.deleted` are logged with the acting superadmin's id

#### Scenario: No audit on refusal

- **WHEN** the deletion is refused with 404 or 409
- **THEN** no admin audit line is written

### Requirement: SPA admin area guard

The SPA SHALL guard every `/admin` page with a session check: a superadmin renders the admin area (overview, users, user detail, companies, company detail); any other role SHALL be redirected to `/dashboard`; a 401 SHALL redirect to login with the current path as `next`; any other check failure SHALL show a retryable error instead of redirecting.

#### Scenario: Superadmin enters the admin area

- **WHEN** a superadmin opens `/admin/users`
- **THEN** the admin users page renders

#### Scenario: Tenant user opens the admin area

- **WHEN** a user with platform role `user` opens any `/admin` page
- **THEN** the SPA redirects to `/dashboard`

#### Scenario: Expired session

- **WHEN** the session check answers 401
- **THEN** the SPA redirects to login with `next` set to the current admin path

#### Scenario: Server unavailable

- **WHEN** the session check fails with a network error or 5xx
- **THEN** the SPA shows a retryable error and stays on the page

### Requirement: SPA routes superadmins to the admin area

The SPA SHALL send superadmins to `/admin` after login and other users to `/dashboard`, and the user area SHALL redirect superadmins to `/admin`.

#### Scenario: Superadmin login

- **WHEN** a superadmin logs in without a `next` target
- **THEN** the SPA navigates to `/admin`

#### Scenario: Superadmin in the user area

- **WHEN** a superadmin opens `/dashboard`
- **THEN** the SPA redirects to `/admin`

### Requirement: SPA users list deletion feedback

The admin users list SHALL render the delete action on the signed-in superadmin's own row disabled with an explanatory tooltip, SHALL warn in the confirmation dialog when the target is a superadmin, and SHALL map 409 `LAST_COMPANY_OWNER`, any other 409, and 404 to distinct user-facing messages.

#### Scenario: Own row locked

- **WHEN** a superadmin views the users list
- **THEN** the delete action on their own row is disabled with a tooltip

#### Scenario: Last-owner refusal surfaced

- **WHEN** a deletion answers 409 with `code: LAST_COMPANY_OWNER`
- **THEN** the SPA shows the last-owner message instead of the generic conflict message

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
