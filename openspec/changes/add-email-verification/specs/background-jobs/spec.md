# Spec Delta

## ADDED Requirements

### Requirement: Unverified accounts are purged daily

The system SHALL, once a day at 03:30 server time under the single-replica rules, delete every account still unverified 7 days after registration together with its company data (as for a last-member deletion), and delete every expired email-verification token.

#### Scenario: Abandoned registration

- **WHEN** an account registered 8 days ago has never been verified
- **THEN** the 03:30 job deletes it and its company, freeing the address

#### Scenario: Recent registration kept

- **WHEN** an unverified account was registered 2 days ago
- **THEN** the job leaves it alone
