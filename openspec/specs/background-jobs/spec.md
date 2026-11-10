# background-jobs Specification

## Purpose
Owns the scheduled maintenance the API runs in-process: the daily removal of expired password-reset tokens and team invites, the 15-minute removal of abandoned pending uploads, session-store pruning, and the shared scheduling rules — single-replica execution, non-overlapping ticks, contained errors and lifecycle.

## Requirements

### Requirement: Expired password-reset tokens are removed daily

The system SHALL delete every password-reset token past its expiry once a day at 03:00 server time, so unused reset links stop existing at rest.

#### Scenario: Daily token sweep

- **WHEN** the 03:00 job runs
- **THEN** every reset token whose expiry is in the past is deleted and unexpired tokens are kept

### Requirement: Expired team invites are removed daily, staggered

The system SHALL delete every team invite past its expiry once a day at 03:15 server time, staggered from the token sweep so the nightly jobs do not hit the database at the same moment.

#### Scenario: Daily invite sweep

- **WHEN** the 03:15 job runs
- **THEN** every invite whose expiry is in the past is deleted and pending invites are kept

### Requirement: Stale pending uploads are removed every 15 minutes

The system SHALL, every 15 minutes, find uploads still `pending` more than 60 minutes after creation, delete their stored objects first, and remove a catalog row only once its object deletion succeeded (a missing object counts as success), logging the number of rows removed. Row removal SHALL be limited to rows still pending.

#### Scenario: Successful sweep

- **WHEN** stale pending uploads exist and their objects delete cleanly
- **THEN** the objects and their rows are removed and the count is logged

#### Scenario: Object deletion fails

- **WHEN** the storage provider fails to delete some objects
- **THEN** those rows are kept and retried on the next tick

#### Scenario: Recent uploads untouched

- **WHEN** an upload has been pending for 30 minutes
- **THEN** the sweep leaves it alone

### Requirement: Upload cleanup alerts once, then warns

The system SHALL log an error (which alerts) when a sweep fails on object keys that did not fail on the previous sweep in the same process, and only a warning while the same keys keep failing, so a persistent outage does not alert on every tick.

#### Scenario: New failures alert

- **WHEN** a sweep fails on keys that did not fail before
- **THEN** an error-level line is logged and an alert is attempted

#### Scenario: Stuck keys downgrade

- **WHEN** the next sweep fails on the same keys
- **THEN** only a warning is logged

### Requirement: Expired sessions are pruned

The system SHALL prune expired session rows from the session store every 2 minutes in each running process.

#### Scenario: Session expiry

- **WHEN** a session's 24-hour lifetime has passed
- **THEN** its row is removed by the next prune

### Requirement: Each scheduled job runs on one replica at a time

The system SHALL run each scheduled job tick only in the process that wins a per-job database advisory lock, held for the duration of the tick and released automatically even if the process dies; other replicas SHALL skip the tick and log an informational note.

#### Scenario: Two replicas

- **WHEN** two replicas reach the same tick
- **THEN** exactly one runs the job and the other logs that it skipped

### Requirement: Ticks never overlap

The system SHALL never start a job's next tick while its previous tick in the same process is still running.

#### Scenario: Slow tick

- **WHEN** an upload sweep is still deleting objects when the next 15-minute mark arrives
- **THEN** no second sweep starts until the first finishes

### Requirement: Job errors are contained

The system SHALL catch any error raised in a tick, including a lock-holding tick that exceeds its 10-minute ceiling, log it with the job name, and never let it crash the process or affect request handling. Errors SHALL be logged at error level unless they are transient database connectivity errors, which follow the downgrade rule.

#### Scenario: Database error in a tick

- **WHEN** the token sweep's query fails with a non-connectivity error
- **THEN** an error naming the job is logged and the server keeps running

### Requirement: Jobs follow the process lifecycle

The system SHALL start the scheduled jobs when the server starts and stop scheduling them as soon as a graceful shutdown begins, then let a tick that is already running finish within the shutdown drain budget before the database is closed. A tick still running when the budget ends SHALL be abandoned with a warning; its lock SHALL be released and the job SHALL resume safely on a later tick.

#### Scenario: Shutdown

- **WHEN** SIGTERM is received
- **THEN** no new job tick starts afterwards

#### Scenario: Tick outlives the drain budget

- **WHEN** a tick is still running when the shutdown drain budget ends
- **THEN** a warning is logged, the database closes, and the next replica to win the lock repeats the work without losing data

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
