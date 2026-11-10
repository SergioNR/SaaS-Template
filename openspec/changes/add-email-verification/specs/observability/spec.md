# Spec Delta

## MODIFIED Requirements

### Requirement: Enumeration-safe auth audit lines

Audit lines for registration, password-reset requests and verification-email resend requests SHALL be `auth.register.requested`, `auth.password_reset.requested` and `auth.email_verification.requested`, written whether or not the account exists and carrying no email, user id or company name, so the logs cannot reveal account existence either.

#### Scenario: Reset requested for an unknown email

- **WHEN** a password reset is requested for an address with no account
- **THEN** an `auth.password_reset.requested` line is logged, identical to the one for a registered address

#### Scenario: Resend requested for an unknown email

- **WHEN** a verification email is requested for an address with no account
- **THEN** an `auth.email_verification.requested` line is logged, identical to the one for an unverified account
