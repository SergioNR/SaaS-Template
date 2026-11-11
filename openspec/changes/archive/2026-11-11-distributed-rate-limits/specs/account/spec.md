# Spec Delta

## ADDED Requirements

### Requirement: Password change is throttled per account

The system SHALL reject `PATCH /api/v1/user/password` with 429 and a JSON `message` once the caller has exhausted the password-change budget defined in `api-hardening`, before comparing the current password, even when the submitted current password is correct. The SPA's password form SHALL show a too-many-attempts message on 429.

#### Scenario: Budget exhausted

- **WHEN** a user has sent 5 wrong current passwords within 15 minutes and then sends the correct one
- **THEN** the API responds 429 and the password is unchanged

#### Scenario: Throttled in the UI

- **WHEN** the password change responds 429
- **THEN** the profile page shows a too-many-attempts message
