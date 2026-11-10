# Spec Delta

## MODIFIED Requirements

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
