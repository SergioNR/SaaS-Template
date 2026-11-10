# Spec Delta

## ADDED Requirements

### Requirement: Verification email budget

The system SHALL give the verification-email resend request its own per-IP budget of 5 requests per hour, independent of the shared credential budget, answering 429 with a JSON `message` and logging a rate-limit warning beyond it, in every environment.

#### Scenario: Resend throttled

- **WHEN** one IP requests a 6th verification email within an hour
- **THEN** the API responds 429

## MODIFIED Requirements

### Requirement: Shared credential endpoint budget

The system SHALL apply a shared per-IP budget of 10 requests per 15 minutes to login, registration, invite check, invite accept, password-reset token check, password-reset submit and email verification, answering 429 with a JSON `message` and logging a rate-limit warning. It SHALL apply in every environment, local development included.

#### Scenario: Shared auth budget

- **WHEN** one IP sends an 11th request within 15 minutes to any of these endpoints
- **THEN** the API responds 429
