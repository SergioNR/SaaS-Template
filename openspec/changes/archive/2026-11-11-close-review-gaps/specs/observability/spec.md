# Spec Delta

## MODIFIED Requirements

### Requirement: Business event catalogue

The system SHALL emit one event after each of: a self-registration that created a company, a subscription starting (marked as a converted trial or a resubscription), a subscription cancellation being scheduled, a subscription ending, an invite being accepted, an account or a company being deleted on any path, automatic ones included. Events SHALL fire only after the triggering write committed, even if a later step of the same flow fails, and never for refused, skipped or stale writes.

#### Scenario: Trial converts

- **WHEN** the first paid subscription of a trial company is synced from Stripe
- **THEN** a subscription-started event marked as a converted trial is posted

#### Scenario: Registration for an existing email

- **WHEN** a registration arrives for an already-registered email
- **THEN** no business event is posted

#### Scenario: Last member leaves

- **WHEN** the last member of a company deletes their account
- **THEN** an account-deleted event and a company-deleted event are posted

#### Scenario: Refused deletion

- **WHEN** a deletion is refused with 409
- **THEN** no business event is posted

#### Scenario: Verification email fails after registration

- **WHEN** a registration created the company but issuing its verification email fails
- **THEN** the company-registered event is still posted

#### Scenario: Unverified account removed automatically

- **WHEN** the daily purge or an invite acceptance deletes an unverified account and its company
- **THEN** account-deleted and company-deleted events are posted naming an automatic cleanup as the actor
