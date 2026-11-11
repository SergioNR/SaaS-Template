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

### Requirement: Access line message is the route pattern

The access line's message SHALL be `METHOD /full/route/pattern` built from the matched route (for example `DELETE /api/v1/team/members/:userId`), so lines for the same endpoint group together whatever ids they carry. Requests that matched no route, including the fallback 404s, SHALL use the concrete path instead.

#### Scenario: Parameterized route

- **WHEN** `GET /api/v1/admin/users/<uuid>` completes
- **THEN** the access line message is `GET /api/v1/admin/users/:userId`

#### Scenario: Unmatched route

- **WHEN** a request hits the fallback 404
- **THEN** the message uses the concrete request path

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

Each alert SHALL be HTML-formatted with the timestamp, the request id (`N/A` outside a request), the error name, the error code (`N/A` when absent), the log message, the error message and the additional context, every value HTML-escaped and truncated to 1000 characters. When the error message is empty or only a Prisma ``Invalid `...` invocation:`` header, the error code SHALL be shown in its place.

#### Scenario: Markup in an error message

- **WHEN** an error message contains `<a href=...>`
- **THEN** the alert shows it as escaped text

#### Scenario: Database unreachable through the driver adapter

- **WHEN** a query fails with `code: "ECONNREFUSED"` and a message holding only the invocation header
- **THEN** the alert shows `ECONNREFUSED` as the error code and as the error details

#### Scenario: Error without a code

- **WHEN** an error carries no `code`
- **THEN** the alert shows `N/A` as the error code and the error's own message as the details

### Requirement: Telegram alerts are deduplicated

The system SHALL send the same alert (same log message, error name, error code and error message) at most once per 60 seconds per process, while still logging every occurrence; the dedupe memory SHALL stay bounded.

#### Scenario: Error on every request

- **WHEN** the database is down and every request logs the same error for a minute
- **THEN** one alert is sent and every occurrence is still logged

#### Scenario: Different codes with the same empty message

- **WHEN** two errors with the same name and an empty message but different codes are logged within a minute
- **THEN** an alert is sent for each

### Requirement: Crash handlers log before exiting

The system SHALL handle an unhandled promise rejection or an uncaught exception by logging it at error level, waiting for its alert delivery for at most 3 seconds, flushing logs best-effort, and exiting with code 1. Crash events arriving while the process is already crashing SHALL be logged without extending the wait or exiting twice.

#### Scenario: Unhandled rejection

- **WHEN** a promise rejects with no handler
- **THEN** an error line describing the crash is logged and the process exits with code 1

#### Scenario: Alert delivered before exit

- **WHEN** Telegram is configured and an uncaught exception occurs
- **THEN** the process exits only after the crash alert was sent or 3 seconds passed

#### Scenario: Second crash while exiting

- **WHEN** another unhandled rejection occurs while the crash alert is being sent
- **THEN** it is logged and the process still exits once with code 1

### Requirement: Graceful shutdown drains work

On SIGTERM or SIGINT the system SHALL mark itself as shutting down, stop scheduling jobs, stop accepting connections and, within one 8-second budget, wait for in-flight requests, running job ticks and tracked fire-and-forget work, then flush analytics, close the database and exit 0. Ticks or background work still running after the budget SHALL be logged as a warning and abandoned.

#### Scenario: Email pending at SIGTERM

- **WHEN** a password-reset email is still being sent when SIGTERM arrives
- **THEN** the shutdown waits for it before closing the database

#### Scenario: Job tick running at SIGTERM

- **WHEN** an upload sweep is mid-run when SIGTERM arrives and finishes within the budget
- **THEN** the database is closed only after the sweep completed

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

### Requirement: Optional business events channel

The system SHALL post business events to the Telegram chat named by `TELEGRAM_EVENTS_CHAT_ID` only when both it and `TELEGRAM_BOT_API_KEY` are set; otherwise sending SHALL be a no-op with no network call. Business events SHALL never go to the errors chat, and error alerts SHALL never go to the events chat.

#### Scenario: Channel not configured

- **WHEN** `TELEGRAM_EVENTS_CHAT_ID` is unset and a company registers
- **THEN** the registration completes and no Telegram request is made

#### Scenario: Channel configured

- **WHEN** both variables are set and a company registers
- **THEN** one message is posted to the events chat

### Requirement: Business event catalogue

The system SHALL emit one event after each of: a self-registration that created a company, a subscription starting (marked as a converted trial or a resubscription), a subscription cancellation being scheduled, a subscription ending, an invite being accepted, an account being deleted, and a company being deleted. Events SHALL fire only after the triggering write committed and never for refused, skipped or stale writes.

#### Scenario: Trial converts

- **WHEN** the first paid subscription of a trial company is synced from Stripe
- **THEN** a subscription-started event marked as a converted trial is posted

#### Scenario: Registration for an existing email

- **WHEN** a registration arrives for an already-registered email
- **THEN** no business event is posted

#### Scenario: Last member leaves

- **WHEN** the last member of a company deletes their account
- **THEN** an account-deleted event and a company-deleted event are posted

#### Scenario: Refused deletion

- **WHEN** a deletion is refused with 409
- **THEN** no business event is posted

### Requirement: Business events carry minimal data

Event messages SHALL contain only the event kind, company name, plan and billing cycle, relevant dates, role names, actor kind and member counts. They SHALL never contain email addresses, user or company ids, Stripe ids, tokens or passwords, and every interpolated value SHALL be HTML-escaped and truncated to 1000 characters.

#### Scenario: Invite accepted

- **WHEN** an invite is accepted
- **THEN** the message names the company and the role and contains no email address

#### Scenario: Markup in a company name

- **WHEN** a company named `<b>Acme</b>` registers
- **THEN** the message shows the name as escaped text

### Requirement: Business events never affect the triggering flow

Business event delivery SHALL be fire-and-forget, tracked as background work so a graceful shutdown waits for it, with the 5-second Telegram timeout. A delivery failure SHALL be logged as a warning only, never alert, and never change the status, body or timing of the response or webhook acknowledgement that triggered it. Events are not deduplicated.

#### Scenario: Telegram down during registration

- **WHEN** the Telegram API is unreachable while a company registers
- **THEN** the registration response is unchanged, a warning is logged and no error alert is attempted

#### Scenario: Webhook acknowledgement unaffected

- **WHEN** a subscription event is processed while Telegram hangs
- **THEN** the webhook responds as it would without the events channel
