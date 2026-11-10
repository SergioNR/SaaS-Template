# Spec Delta

## MODIFIED Requirements

### Requirement: The user dashboard summarises account and subscription state

The dashboard SHALL show the signed-in email (or a generic greeting) and today's date; cards for subscription status (paid, trial or inactive, per `billing`), days remaining, last login and member since; a plan card with period progress when active, else a call to view plans; billing and profile links; a renewal indicator; and an activity timeline; skeletons while loading. If the subscription fails, its cards SHALL show an unknown state, not inactive, and an error alert with retry.

#### Scenario: Loading

- **WHEN** the dashboard opens before the subscription and profile have loaded
- **THEN** skeleton placeholders render in the summary and plan cards

#### Scenario: Trial company

- **WHEN** the company is on a running trial
- **THEN** the subscription card shows the trial status and the days-remaining card shows the days until the trial end

#### Scenario: Subscription fails to load

- **WHEN** the subscription request fails with a network error or 5xx
- **THEN** the subscription-derived cards show an unknown state with no inactive badge and no call to view plans
- **AND** an error alert with a retry action renders

#### Scenario: Retry after a load failure

- **WHEN** the user presses retry and the subscription request now succeeds
- **THEN** the cards show skeletons while loading and then the real subscription status

#### Scenario: No company membership

- **WHEN** the subscription request answers 403 with code `COMPANY_MEMBERSHIP_REQUIRED`
- **THEN** the dashboard shows the membership message without a retry action

### Requirement: The dashboard prompts companies without a subscription

When the subscription has loaded and no subscription is active, the dashboard SHALL show a no-subscription banner at the top with a call to action to `/user/billing`, and an inline note linking to plan selection at the bottom. Both the banner and the inline note SHALL stay hidden while loading and when the subscription failed to load.

#### Scenario: No active subscription

- **WHEN** the company has no paid subscription and no running trial
- **THEN** the inactive status, the no-subscription banner and a link to choose a plan render

#### Scenario: Load failure shows no purchase prompt

- **WHEN** the subscription request fails
- **THEN** neither the no-subscription banner nor the choose-a-plan note renders
