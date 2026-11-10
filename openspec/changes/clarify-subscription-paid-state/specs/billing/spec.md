# Spec Delta

## MODIFIED Requirements

### Requirement: Subscription status read

The system SHALL expose `GET /api/v1/billing` responding 200 with `{ "subscriptionData": { "created_at", "updated_at", "expires_at", "status", "is_paid", "has_billing_id" } }`, or 404 with a `message` when the company has no subscription row. No Stripe id or internal row id SHALL be exposed.

#### Scenario: Trial company

- **WHEN** a company in its trial reads its status
- **THEN** `status` is `trial`, `is_paid` is `false`, `has_billing_id` is `false` until a Stripe customer exists, and `expires_at` is the trial end

### Requirement: Paid versus trial semantics

The system SHALL compute `status` as `paid` when the row is linked to a Stripe subscription and `expires_at` is in the future, `trial` when it is not linked and `expires_at` is in the future, and `inactive` otherwise. `is_paid` SHALL be `true` exactly when `status` is `paid`, and `has_billing_id` SHALL be `true` whenever the company has a Stripe customer.

#### Scenario: Paid subscription ended

- **WHEN** a company's Stripe subscription was cancelled and its end date has passed
- **THEN** the status reads `status: inactive` and `is_paid: false`, with `has_billing_id` still `true`

#### Scenario: Active paid subscription

- **WHEN** a company's Stripe subscription is `active` or `past_due` with a future `expires_at`
- **THEN** the status reads `status: paid` and `is_paid: true`

### Requirement: Billing page status

The SPA's billing page SHALL show the status as paid, trial or inactive from the API's `status` (a missing row or 404 counts as inactive), with the expiry or trial-end date when present. It SHALL show a specific error for `COMPANY_MEMBERSHIP_REQUIRED` and a generic error for other load failures.

#### Scenario: Trial company

- **WHEN** a trial company opens the billing page
- **THEN** the page shows the trial status, the trial end date and the plan offer
