# Spec Delta

## ADDED Requirements

### Requirement: Optional business events channel

The system SHALL post business events to the Telegram chat named by `TELEGRAM_EVENTS_CHAT_ID` only when both it and `TELEGRAM_BOT_API_KEY` are set; otherwise sending SHALL be a no-op with no network call. Business events SHALL never go to the errors chat, and error alerts SHALL never go to the events chat.

#### Scenario: Channel not configured

- **WHEN** `TELEGRAM_EVENTS_CHAT_ID` is unset and a company registers
- **THEN** the registration completes and no Telegram request is made

#### Scenario: Channel configured

- **WHEN** both variables are set and a company registers
- **THEN** one message is posted to the events chat

### Requirement: Business event catalogue

The system SHALL emit one event after each of: a self-registration that created a company, a subscription starting (marked as a converted trial or a resubscription), a subscription cancellation being scheduled, a subscription ending, an invite being accepted, an account being deleted, and a company being deleted. Events SHALL fire only after the triggering write committed and never for refused, skipped or stale writes.

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

### Requirement: Business events carry minimal data

Event messages SHALL contain only the event kind, company name, plan and billing cycle, relevant dates, role names, actor kind and member counts. They SHALL never contain email addresses, user or company ids, Stripe ids, tokens or passwords, and every interpolated value SHALL be HTML-escaped and truncated to 1000 characters.

#### Scenario: Invite accepted

- **WHEN** an invite is accepted
- **THEN** the message names the company and the role and contains no email address

#### Scenario: Markup in a company name

- **WHEN** a company named `<b>Acme</b>` registers
- **THEN** the message shows the name as escaped text

### Requirement: Business events never affect the triggering flow

Business event delivery SHALL be fire-and-forget, tracked as background work so a graceful shutdown waits for it, with the 5-second Telegram timeout. A delivery failure SHALL be logged as a warning only, never alert, and never change the status, body or timing of the response or webhook acknowledgement that triggered it. Events are not deduplicated.

#### Scenario: Telegram down during registration

- **WHEN** the Telegram API is unreachable while a company registers
- **THEN** the registration response is unchanged, a warning is logged and no error alert is attempted

#### Scenario: Webhook acknowledgement unaffected

- **WHEN** a subscription event is processed while Telegram hangs
- **THEN** the webhook responds as it would without the events channel
