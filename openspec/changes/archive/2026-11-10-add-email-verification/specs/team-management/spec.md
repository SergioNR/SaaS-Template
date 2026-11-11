# Spec Delta

## MODIFIED Requirements

### Requirement: Invite delivery does not reveal accounts

The system SHALL respond to invite creation and resend identically whether or not the invited email already has an account, storing the row in both cases. Delivery SHALL run detached after the response: an email with the invite token, company name and inviter email is sent unless a verified account exists for the address; delivery failures are only logged.

#### Scenario: Already-registered address

- **WHEN** an owner invites an email that already has a verified account
- **THEN** the API responds 201, the invite is listed as pending, and no email is sent

#### Scenario: Unverified holder of the address

- **WHEN** an owner invites an email held only by an unverified account
- **THEN** the invite email is sent, so the mailbox owner can accept it
