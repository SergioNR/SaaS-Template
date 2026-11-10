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

The system SHALL catch any error raised in a tick, including a lock-holding tick that exceeds its 10-minute ceiling, log it at error level with the job name, and never let it crash the process or affect request handling.

#### Scenario: Database error in a tick

- **WHEN** the token sweep's query fails
- **THEN** an error naming the job is logged and the server keeps running

### Requirement: Jobs follow the process lifecycle

The system SHALL start the scheduled jobs when the server starts and stop scheduling them as soon as a graceful shutdown begins.

#### Scenario: Shutdown

- **WHEN** SIGTERM is received
- **THEN** no new job tick starts afterwards

### Requirement: Unverified accounts are purged daily

The system SHALL, once a day at 03:30 server time under the single-replica rules, delete every account still unverified 7 days after registration together with its company data (as for a last-member deletion), and delete every expired email-verification token.

#### Scenario: Abandoned registration

- **WHEN** an account registered 8 days ago has never been verified
- **THEN** the 03:30 job deletes it and its company, freeing the address

#### Scenario: Recent registration kept

- **WHEN** an unverified account was registered 2 days ago
- **THEN** the job leaves it alone
