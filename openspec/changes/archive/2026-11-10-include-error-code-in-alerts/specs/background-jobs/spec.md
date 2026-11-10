# Spec Delta

## MODIFIED Requirements

### Requirement: Job errors are contained

The system SHALL catch any error raised in a tick, including a lock-holding tick that exceeds its 10-minute ceiling, log it with the job name, and never let it crash the process or affect request handling. Errors SHALL be logged at error level unless they are transient database connectivity errors, which follow the downgrade rule.

#### Scenario: Database error in a tick

- **WHEN** the token sweep's query fails with a non-connectivity error
- **THEN** an error naming the job is logged and the server keeps running

## ADDED Requirements

### Requirement: Transient database outages downgrade job alerts

The system SHALL treat a tick failure whose error (or its cause) has code `P1001`, `P1017`, `ECONNREFUSED`, `ECONNRESET` or `ETIMEDOUT` as transient: it SHALL log a warning with the job name, code and consecutive count, and log an error only on the third consecutive transient failure of that job in the process. A successful or lock-skipped tick SHALL reset the count.

#### Scenario: Short database restart

- **WHEN** one upload sweep fails with `ECONNREFUSED` and the next tick succeeds
- **THEN** only a warning is logged and no alert is attempted

#### Scenario: Prolonged outage

- **WHEN** the same job fails with a transient connectivity error on three consecutive ticks
- **THEN** the third failure is logged at error level and an alert is attempted, and further transient failures stay warnings until a tick succeeds

#### Scenario: Non-transient error alerts at once

- **WHEN** a tick fails with an error whose code is not transient
- **THEN** it is logged at error level on the first occurrence
