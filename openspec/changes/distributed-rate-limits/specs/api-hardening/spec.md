# Spec Delta

## ADDED Requirements

### Requirement: Credential budgets can be shared across replicas

When `RATE_LIMIT_STORE=postgres`, the system SHALL keep the shared credential budget, the per-account login budget, the password-reset email budget and the password-change budget in a database-backed store, so every replica and restart sees the same counters. Without it (default `memory`) counters SHALL be per process. Store errors SHALL let the request through and log a warning.

#### Scenario: Two replicas share the auth budget

- **WHEN** the shared store is enabled and one IP spreads 11 credential requests within 15 minutes across two replicas
- **THEN** the 11th request responds 429

#### Scenario: Store unavailable

- **WHEN** the shared store fails while a login is attempted
- **THEN** the limiter lets the request through and logs a warning

#### Scenario: Unknown store value

- **WHEN** a deployed environment boots with `RATE_LIMIT_STORE=redis`
- **THEN** the server refuses to start

### Requirement: Password-change budget

The system SHALL allow at most 5 failed current-password checks per 15 minutes per authenticated user on the password-change endpoints, answering 429 with a JSON `message` and logging a rate-limit warning beyond it, in every environment. Only rejections with `code: "AUTH_CURRENT_PASSWORD_INCORRECT"` SHALL count.

#### Scenario: Stolen session guessing the current password

- **WHEN** one session sends a 6th wrong current password within 15 minutes
- **THEN** the API responds 429 without checking the password

#### Scenario: Other rejections do not count

- **WHEN** a user receives `AUTH_PASSWORD_UNCHANGED` or 422 several times
- **THEN** those attempts do not consume the budget

## MODIFIED Requirements

### Requirement: Per-account login budget

The system SHALL allow at most 5 failed login attempts per 15 minutes per normalized email together with the client IP (successful logins do not count), answering 429 with a JSON `message` beyond it. IPv6 clients SHALL be keyed by their /56 subnet in this and every other IP-keyed limiter. Limiter state is per process unless the shared credential store is enabled.

#### Scenario: Account brute force from one source

- **WHEN** one IP fails to log in to the same account 5 times within 15 minutes
- **THEN** the next login attempt for that account from that IP responds 429

#### Scenario: Victim not locked out from elsewhere

- **WHEN** an attacker has exhausted the per-account budget of a victim's email from their own IP
- **THEN** the victim can still attempt to log in from a different IP
