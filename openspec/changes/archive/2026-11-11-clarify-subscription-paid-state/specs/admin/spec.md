# Spec Delta

## MODIFIED Requirements

### Requirement: Platform stats

The system SHALL answer `GET /api/v1/admin/stats` with 200 and a `stats` object holding `totalUsers`, `totalSuperadmins`, `newUsersLastWeek` (accounts created in the last 7 days), `totalCompanies`, `totalSubscriptions`, `activeSubscriptions` (Stripe-backed subscriptions whose `expires_at` is in the future), `activeTrials` (trials whose `expires_at` is in the future) and `activeSessions` (unexpired sessions).

#### Scenario: Stats read

- **WHEN** a superadmin requests the stats
- **THEN** the API responds 200 with all eight counters

#### Scenario: Trials are not active subscriptions

- **WHEN** the platform has one paid unexpired subscription and two unexpired trials
- **THEN** `activeSubscriptions` is 1 and `activeTrials` is 2

### Requirement: User detail

The system SHALL answer `GET /api/v1/admin/users/:userId` with 200 and `{ user }`: the account fields without the password hash, an `activeSessionCount`, and a `company` (null without one) holding `id`, `name`, a `stripeLinked` boolean and its `subscription` (`created_at`, `updated_at`, `expires_at`, `status`, `is_paid`, no row id) or null. Session contents SHALL never be exposed. A malformed id SHALL answer 422 and an unknown id 404 with `{}`.

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

#### Scenario: Subscription kind without internal ids

- **WHEN** the user's company is in its trial
- **THEN** the subscription shows `status: trial` and `is_paid: false` and carries no row id or Stripe id

### Requirement: Company list

The system SHALL answer `GET /api/v1/admin/companies` with 200 and `{ companyCount, companies, nextCursor }`, where `search` filters on the company name and each row carries the company fields, its member count `userCount`, a `stripeLinked` boolean and its subscription (`created_at`, `updated_at`, `expires_at`, `status`, `is_paid`) or null. Optional filters SHALL be `stripe_linked` (`true`/`false`) and an inclusive creation date range; `sort` SHALL accept `name` and `created_at`. No Stripe customer or subscription id SHALL be exposed.

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

### Requirement: Company detail

The system SHALL answer `GET /api/v1/admin/companies/:companyId` with 200 and `{ company }` carrying the company fields, `stripeLinked`, its subscription (`created_at`, `updated_at`, `expires_at`, `status`, `is_paid`) or null, and its members (`id`, `email`, `role`, `created_at`, `last_login_at`, newest first), without any Stripe id. A malformed id SHALL answer 422 and an unknown id 404 with `{}`.

#### Scenario: Company detail

- **WHEN** a superadmin requests an existing company
- **THEN** the API responds 200 with the company, its subscription dates and status, and its members

#### Scenario: Unknown company

- **WHEN** the id is a well-formed UUID that matches no company
- **THEN** the API responds 404 with `{}`
