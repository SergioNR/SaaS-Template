# Spec Delta

## MODIFIED Requirements

### Requirement: Jobs follow the process lifecycle

The system SHALL start the scheduled jobs when the server starts and stop scheduling them as soon as a graceful shutdown begins, then let a tick that is already running finish within the shutdown drain budget before the database is closed. A tick still running when the budget ends SHALL be abandoned with a warning; its lock SHALL be released and the job SHALL resume safely on a later tick.

#### Scenario: Shutdown

- **WHEN** SIGTERM is received
- **THEN** no new job tick starts afterwards

#### Scenario: Tick outlives the drain budget

- **WHEN** a tick is still running when the shutdown drain budget ends
- **THEN** a warning is logged, the database closes, and the next replica to win the lock repeats the work without losing data
