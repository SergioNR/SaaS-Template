# Spec Delta

## MODIFIED Requirements

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
