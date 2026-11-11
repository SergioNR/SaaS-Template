# Spec Delta

## MODIFIED Requirements

### Requirement: Credential budgets can be shared across replicas

When `RATE_LIMIT_STORE=postgres`, the system SHALL keep the shared credential budget, the per-account login budget, the password-reset and verification email budgets and the password-change budget in a database-backed store, so every replica and restart sees the same counters. Without it (default `memory`) counters SHALL be per process. Store errors SHALL let the request through and log a warning.

#### Scenario: Two replicas share the auth budget

- **WHEN** the shared store is enabled and one IP spreads 11 credential requests within 15 minutes across two replicas
- **THEN** the 11th request responds 429

#### Scenario: Verification emails across replicas

- **WHEN** the shared store is enabled and one IP requests a 6th verification email within an hour across two replicas
- **THEN** the API responds 429

#### Scenario: Store unavailable

- **WHEN** the shared store fails while a login is attempted
- **THEN** the limiter lets the request through and logs a warning

#### Scenario: Unknown store value

- **WHEN** a deployed environment boots with `RATE_LIMIT_STORE=redis`
- **THEN** the server refuses to start
