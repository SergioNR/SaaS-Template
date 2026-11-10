# Spec Delta

## MODIFIED Requirements

### Requirement: Checkout input

The system SHALL expose `POST /api/v1/billing/checkout-session` (requires `billing.manage`) taking `planName` (`basic` or `pro`) and `planBillingCycle` (`monthly` or `yearly`) from the JSON body; any other or missing body value, including a value sent only in the query string, SHALL respond 422 and never a server error.

#### Scenario: Unknown plan

- **WHEN** `planName` is `enterprise`
- **THEN** the API responds 422

#### Scenario: Plan sent in the query string

- **WHEN** an owner calls `POST /api/v1/billing/checkout-session?planName=pro&planBillingCycle=monthly` with an empty body
- **THEN** the API responds 422 and no Stripe call is made
