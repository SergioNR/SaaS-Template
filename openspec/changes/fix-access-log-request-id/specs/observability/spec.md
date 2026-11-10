# Spec Delta

## MODIFIED Requirements

### Requirement: One access line per request

The system SHALL write one structured access line per request when its response finishes, except for `/health`, carrying the method and path without query string, the status code, the response time, the acting `userId` and `companyId` (null when anonymous), the client IP and the request id as `reqId`. Headers and bodies SHALL never be logged. The level SHALL be `info` below 400, `warn` for 4xx and `error` for 5xx or aborted responses.

#### Scenario: Token kept out of the access log

- **WHEN** a request to `/api/v1/auth/password-reset?token=abc` completes
- **THEN** the access line's path is `/api/v1/auth/password-reset` with no query string

#### Scenario: Client error level

- **WHEN** a request answers 404
- **THEN** its access line is logged at `warn`

#### Scenario: Health not logged

- **WHEN** `/health` is polled
- **THEN** no access line is written

#### Scenario: Access line carries the request id

- **WHEN** any logged request completes
- **THEN** its access line's `reqId` equals the response's `X-Request-Id`

### Requirement: Server-generated request id

The system SHALL generate a fresh UUID for every request, including health, webhook and docs requests, return it in the `X-Request-Id` response header, and SHALL never adopt an inbound `X-Request-Id`. The same id SHALL appear as `reqId` on access and audit lines and as `requestId` on error-handler lines and Telegram alerts of that request.

#### Scenario: Header on every response

- **WHEN** any request is answered
- **THEN** the response carries an `X-Request-Id` UUID

#### Scenario: Inbound id ignored

- **WHEN** a client sends its own `X-Request-Id`
- **THEN** the response carries a different, server-generated id

#### Scenario: Error correlates with its access line

- **WHEN** a handler throws and the request answers 500
- **THEN** the error-handler line's `requestId` and the access line's `reqId` are the same value
