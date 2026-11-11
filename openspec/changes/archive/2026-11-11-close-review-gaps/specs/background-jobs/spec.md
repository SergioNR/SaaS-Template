# Spec Delta

## MODIFIED Requirements

### Requirement: Unverified accounts are purged daily

The system SHALL, once a day at 03:45 server time under the single-replica rules, delete every account still unverified 7 days after registration together with its company data (as for a last-member deletion), and delete every expired email-verification token. A failure on one account SHALL be logged as an error and SHALL not stop the others, except a transient database connectivity error or any error after shutdown started, which SHALL end the tick and follow the job-wide failure rules.

#### Scenario: Abandoned registration

- **WHEN** an account registered 8 days ago has never been verified
- **THEN** the 03:45 job deletes it and its company, freeing the address

#### Scenario: Recent registration kept

- **WHEN** an unverified account was registered 2 days ago
- **THEN** the job leaves it alone

#### Scenario: Database outage during the purge

- **WHEN** the database becomes unreachable while the purge is deleting accounts
- **THEN** the tick ends with a single transient failure (a warning until the third consecutive one) instead of one alert per account
