# Spec Delta

## ADDED Requirements

### Requirement: Credentials are accepted only in the request body

The system SHALL read `username`, `password`, `newPassword`, `confirmNewPassword`, `currentPassword`, `passwordResetToken` (on completion) and `email` (on reset request) only from the JSON body of the auth and account flows. Credentials supplied in the query string SHALL never authenticate or change anything: a request whose body lacks them SHALL answer 422.

#### Scenario: Login with query-string credentials

- **WHEN** `POST /api/v1/auth/login?username=<email>&password=<password>` arrives with no body
- **THEN** the API responds 422, no account lookup runs and no session is established

#### Scenario: Body credentials win

- **WHEN** a login carries valid credentials in the body and different ones in the query string
- **THEN** only the body credentials are evaluated
