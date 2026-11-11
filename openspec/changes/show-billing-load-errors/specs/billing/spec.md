# Spec Delta

## MODIFIED Requirements

### Requirement: Billing page status

The SPA's billing page SHALL show the status as paid, trial or inactive from the API's `status` (a missing row or 404 counts as inactive), with the expiry or trial-end date when present. It SHALL show a specific error without retry for `COMPANY_MEMBERSHIP_REQUIRED` and a generic error with a retry action for other load failures; retry SHALL re-run the status load with its loader.

#### Scenario: Trial company

- **WHEN** a trial company opens the billing page
- **THEN** the page shows the trial status, the trial end date and the plan offer

#### Scenario: Transient load failure

- **WHEN** the status request fails with a network error or 5xx
- **THEN** the page shows the generic error with a retry action and no plan status

#### Scenario: Retry succeeds

- **WHEN** the user presses retry and the status request succeeds
- **THEN** the loader shows and then the page renders the current status

#### Scenario: Membership required

- **WHEN** the status request answers 403 with code `COMPANY_MEMBERSHIP_REQUIRED`
- **THEN** the page shows the membership error without a retry action
