# Spec Delta

## MODIFIED Requirements

### Requirement: Upload cleanup alerts once, then warns

The system SHALL log an error (which alerts) when a sweep fails on object keys that had never failed before on any replica, and only a warning while already-failed keys keep failing, so a persistent outage does not alert on every tick, whichever replica runs it and across restarts. The failure memory SHALL be persisted with the pending rows.

#### Scenario: New failures alert

- **WHEN** a sweep fails on keys that never failed before
- **THEN** an error-level line is logged and an alert is attempted

#### Scenario: Stuck keys downgrade

- **WHEN** the next sweep fails on the same keys
- **THEN** only a warning is logged

#### Scenario: Another replica runs the next sweep

- **WHEN** replica A's sweep alerted for a key and replica B runs the next sweep, which fails on the same key
- **THEN** replica B logs only a warning

### Requirement: Expired sessions are pruned

The system SHALL delete expired session rows from the session store every 15 minutes as a scheduled job that follows the single-replica, non-overlapping and error-containment rules of the other jobs. Expired sessions SHALL be refused on read regardless of when they are pruned.

#### Scenario: Session expiry

- **WHEN** a session's 24-hour lifetime has passed
- **THEN** its row is removed by the next prune and any request using it is unauthenticated even before that

#### Scenario: Two replicas prune

- **WHEN** two replicas reach the same prune tick
- **THEN** exactly one deletes the expired rows and the other logs that it skipped
