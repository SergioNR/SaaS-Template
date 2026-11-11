# observability Specification

## Purpose
Owns what the system reveals about itself: the health probe (including draining during shutdown), per-request access logging and request ids, business audit lines, error logging with request context, sensitive-field redaction, log level and shipping targets, Telegram error alerts, crash handling, graceful shutdown of in-flight and background work, and consent-gated frontend error reporting.

## Requirements

### Requirement: Health probe includes the database

The system SHALL answer `GET /health` with 200 and `{"status":"ok"}` when the process is up and the database answers a trivial query, and with 503 and `{"status":"unavailable"}` (logging a warning) when the database is unreachable. The probe SHALL never be rate-limited, delayed or access-logged.

#### Scenario: Healthy probe

- **WHEN** the database is reachable and `/health` is requested
- **THEN** the API responds 200 with `status: ok`

#### Scenario: Database down

- **WHEN** the database does not answer
- **THEN** the API responds 503 with `status: unavailable`

### Requirement: Health reports unavailable while shutting down

Once a graceful shutdown has started, the system SHALL answer `GET /health` with 503 and `{"status":"unavailable"}` without querying the database, so traffic drains away from the replica.

#### Scenario: Draining replica

- **WHEN** the process received SIGTERM and is still finishing in-flight work
- **THEN** `/health` responds 503

### Requirement: One access line per request

The system SHALL write one structured access line per request when its response finishes, except for `/health`, carrying the method and path without query string, the status code, the response time, the acting `userId` and `companyId` (null when anonymous) and the client IP. Headers and bodies SHALL never be logged. The level SHALL be `info` below 400, `warn` for 4xx and `error` for 5xx or aborted responses.

#### Scenario: Token kept out of the access log

- **WHEN** a request to `/api/v1/auth/password-reset?token=abc` completes
- **THEN** the access line's path is `/api/v1/auth/password-reset` with no query string

#### Scenario: Client error level

- **WHEN** a request answers 404
- **THEN** its access line is logged at `warn`

#### Scenario: Health not logged

- **WHEN** `/health` is polled
- **THEN** no access line is written

### Requirement: Access line message is the route pattern

The access line's message SHALL be `METHOD /full/route/pattern` built from the matched route (for example `DELETE /api/v1/team/members/:userId`), so lines for the same endpoint group together whatever ids they carry. Requests that matched no route, including the fallback 404s, SHALL use the concrete path instead.

#### Scenario: Parameterized route

- **WHEN** `GET /api/v1/admin/users/<uuid>` completes
- **THEN** the access line message is `GET /api/v1/admin/users/:userId`

#### Scenario: Unmatched route

- **WHEN** a request hits the fallback 404
- **THEN** the message uses the concrete request path

### Requirement: Server-generated request id

The system SHALL generate a fresh UUID for every request, including health, webhook and docs requests, return it in the `X-Request-Id` response header, and SHALL never adopt an inbound `X-Request-Id`. The same id SHALL appear as `reqId` on audit lines and as `requestId` on error-handler lines and Telegram alerts of that request.

#### Scenario: Header on every response

- **WHEN** any request is answered
- **THEN** the response carries an `X-Request-Id` UUID

#### Scenario: Inbound id ignored

- **WHEN** a client sends its own `X-Request-Id`
- **THEN** the response carries a different, server-generated id

### Requirement: Audit lines for successful writes

The system SHALL write an `info` audit line for each successful business write, whose message is an `<entity>.<verb>`-style action name (for example `file.deleted`, `team.member.role_updated`, `admin.user.deleted`), with an `audit` object holding `entity`, `entityId` and, when relevant, `changedFields` as field names only, plus top-level `userId`, `companyId` and `reqId`. Audit lines SHALL never carry field values or free text and SHALL never trigger alerts.

#### Scenario: Role change audit

- **WHEN** a member's company role is changed
- **THEN** a `team.member.role_updated` line is logged with `changedFields: ["role"]` and no role values

#### Scenario: Refused write

- **WHEN** a write is rejected with a 4xx
- **THEN** no audit line is written for it

### Requirement: Enumeration-safe auth audit lines

Audit lines for registration, password-reset requests and verification-email resend requests SHALL be `auth.register.requested`, `auth.password_reset.requested` and `auth.email_verification.requested`, written whether or not the account exists and carrying no email, user id or company name, so the logs cannot reveal account existence either.

#### Scenario: Reset requested for an unknown email

- **WHEN** a password reset is requested for an address with no account
- **THEN** an `auth.password_reset.requested` line is logged, identical to the one for a registered address

#### Scenario: Resend requested for an unknown email

- **WHEN** a verification email is requested for an address with no account
- **THEN** an `auth.email_verification.requested` line is logged, identical to the one for an unverified account

### Requirement: Error handler logs request context

The system SHALL log every error that reaches the global error handler with the request id, method, path without query string and acting user id. Errors resolving to 4xx SHALL be logged as warnings and never alert; 5xx SHALL be logged as errors.

#### Scenario: Unhandled server error

- **WHEN** a handler throws an unexpected error
- **THEN** an error line with `requestId`, method, path and user id is logged and an alert is attempted

#### Scenario: Malformed JSON

- **WHEN** a request fails with 400 for an unparsable body
- **THEN** a warning is logged and no alert is sent

### Requirement: Logged errors are whitelisted and redacted

The system SHALL log only an error's `name`, `message`, `code`, `status` and `stack`, never the whole error object. Passwords, reset and invite tokens, emails and usernames in log context, cookie and authorization headers, and request bodies SHALL be replaced by `[REDACTED]`.

#### Scenario: Library error with a body attached

- **WHEN** a body-parser error carrying the raw request body is logged
- **THEN** the body does not appear in the log line

#### Scenario: Password in context

- **WHEN** a log call includes a `password` field in its context
- **THEN** the line shows `[REDACTED]`

### Requirement: Log level and output targets

The system SHALL log at the level named by `LOG_LEVEL`, falling back to `info` when unset or unknown. Logs SHALL go to stdout as JSON lines, pretty-printed only on `DEPLOY_ENVIRONMENT=localhost` when the pretty printer is installed, and SHALL additionally ship to Better Stack only when both `BETTER_STACK_SOURCE_TOKEN` and `BETTER_STACK_INGESTING_HOST` are set.

#### Scenario: Unknown level

- **WHEN** `LOG_LEVEL=verbose`
- **THEN** the server boots and logs at `info`

#### Scenario: Half-configured shipping

- **WHEN** only `BETTER_STACK_SOURCE_TOKEN` is set
- **THEN** logs go to stdout only

### Requirement: Telegram alerts for errors only

The system SHALL send a Telegram message for every error-level log call when `TELEGRAM_BOT_API_KEY` and `TELEGRAM_ERRORS_CHAT_ID` are set, and never for info or warning lines or access lines. Without configuration sending SHALL be a no-op. Delivery SHALL be fire-and-forget with a 5-second timeout, and its failures SHALL never affect the request or the log call.

#### Scenario: Telegram unreachable

- **WHEN** the Telegram API hangs during an alert
- **THEN** the request that logged the error is unaffected and the send is abandoned after 5 seconds

#### Scenario: Not configured

- **WHEN** no bot key is set
- **THEN** errors are logged and no network call is made

### Requirement: Telegram alert format

Each alert SHALL be HTML-formatted with the timestamp, the request id (`N/A` outside a request), the error name, the log message, the error message and the additional context, every interpolated value HTML-escaped and truncated to 1000 characters, so error text can neither break delivery nor inject markup.

#### Scenario: Markup in an error message

- **WHEN** an error message contains `<a href=...>`
- **THEN** the alert shows it as escaped text

### Requirement: Telegram alerts are deduplicated

The system SHALL send the same alert (same log message, error name and error message) at most once per 60 seconds per process, while still logging every occurrence; the dedupe memory SHALL stay bounded.

#### Scenario: Error on every request

- **WHEN** the database is down and every request logs the same error for a minute
- **THEN** one alert is sent and every occurrence is still logged

### Requirement: Crash handlers log before exiting

The system SHALL handle an unhandled promise rejection or an uncaught exception by logging it at error level, flushing logs best-effort, and exiting with code 1.

#### Scenario: Unhandled rejection

- **WHEN** a promise rejects with no handler
- **THEN** an error line describing the crash is logged and the process exits with code 1

### Requirement: Graceful shutdown drains work

On SIGTERM or SIGINT the system SHALL mark itself as shutting down, stop scheduled jobs, stop accepting connections and finish in-flight requests while waiting up to 8 seconds for tracked fire-and-forget work (emails, detached registration, analytics events, last-login updates), then flush analytics, close the database and exit 0; leftover background work SHALL be logged as a warning and abandoned.

#### Scenario: Email pending at SIGTERM

- **WHEN** a password-reset email is still being sent when SIGTERM arrives
- **THEN** the shutdown waits for it before closing the database

#### Scenario: Repeated signal

- **WHEN** a second SIGTERM arrives during the shutdown
- **THEN** it is ignored

### Requirement: Shutdown has a hard ceiling

If the graceful shutdown has not completed 10 seconds after the signal, the system SHALL log an error, flush logs best-effort and exit with code 1.

#### Scenario: Stuck connection

- **WHEN** a connection keeps the server from closing for more than 10 seconds
- **THEN** the process logs the timeout and exits with code 1

### Requirement: Frontend error reporting only after consent

The SPA SHALL report render errors caught by its error boundary to analytics only when analytics is configured and the visitor has accepted analytics consent; otherwise reporting SHALL be a no-op. A stale-deploy chunk load error SHALL first trigger one reload instead of a report.

#### Scenario: Consent not given

- **WHEN** a page crashes for a visitor who has not accepted analytics
- **THEN** the fallback screen is shown and nothing is sent

#### Scenario: Consent given

- **WHEN** a page crashes for a visitor who accepted analytics
- **THEN** the error and its component stack are reported
