# Spec Delta

## MODIFIED Requirements

### Requirement: Authenticated auth routes require a session

The system SHALL answer 401 with `{}` to every authenticated route under `/api/v1/auth` (`POST /logout`, `GET /session`) when the request carries no valid session, and SHALL also answer 401 to unauthenticated requests for paths under `/api/v1/auth` that match no route. Authenticated requests to unknown paths under `/api/v1/auth` SHALL receive 404 with a JSON `message`.

#### Scenario: Unknown auth path while authenticated

- **WHEN** an authenticated client requests a path under `/api/v1/auth` that matches no route
- **THEN** the API responds 404 with a `message`

#### Scenario: Unknown auth path while unauthenticated

- **WHEN** an unauthenticated client requests a path under `/api/v1/auth` that matches no public route
- **THEN** the API responds 401 with `{}`

#### Scenario: Removed alias

- **WHEN** an authenticated client calls `PATCH /api/v1/auth/update-user-password`
- **THEN** the API responds 404 and no password changes
