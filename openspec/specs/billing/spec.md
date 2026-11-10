# billing Specification

## Purpose
Owns company subscriptions and their Stripe integration: the trial created at onboarding, plan and price configuration validated at boot, subscription status reads (`is_paid`, `has_billing_id`), Stripe customer creation, Checkout session creation and reuse, the Stripe customer portal, the Stripe webhook that keeps the local subscription in sync, and the Stripe teardown when a company is deleted. It also owns the SPA billing page. Who may manage billing comes from the permission model in `team-management`; when a company is deleted is defined in `account`.

## Requirements

### Requirement: Onboarding starts a free trial

The system SHALL create a subscription row for every self-registered company with an expiry 7 days after registration and no Stripe subscription behind it. Companies joined through an invite SHALL NOT receive another trial.

#### Scenario: New company

- **WHEN** a user self-registers
- **THEN** their company's subscription expires 7 days later and reads as `is_paid: false`

### Requirement: Plan prices are validated at boot

The system SHALL support plans `basic` and `pro` with billing cycles `monthly` and `yearly`, each resolving to its own configured Stripe price id or, when unset, to a shared fallback price id. Outside local development the API SHALL refuse to start when any plan/cycle resolves to no price id or when the Stripe API key or webhook secret is missing; on localhost it SHALL only warn.

#### Scenario: Missing price in production

- **WHEN** the API starts outside localhost with no price id for `basic` yearly and no fallback
- **THEN** startup fails with an error naming the missing variable

#### Scenario: Fallback price

- **WHEN** only the fallback price id is configured
- **THEN** every plan and cycle checks out with that price

### Requirement: Billing route gates

Every `/api/v1/billing` route SHALL require an authenticated session (401), a platform role of `user` or `superadmin` (403), and company membership (403 with `code: "COMPANY_MEMBERSHIP_REQUIRED"`). Reading the status SHALL be open to every company member; every route that creates Stripe objects SHALL require the `billing.manage` permission (403 with a `message`). Unknown paths SHALL respond 404.

#### Scenario: Admin starts a checkout

- **WHEN** a `company_admin` calls `POST /api/v1/billing/checkout-session`
- **THEN** the API responds 403 because only owners hold `billing.manage`

#### Scenario: Member reads status

- **WHEN** a `company_member` calls `GET /api/v1/billing`
- **THEN** the API responds with the company's subscription status

### Requirement: Subscription status read

The system SHALL expose `GET /api/v1/billing` responding 200 with `{ "subscriptionData": { "created_at", "updated_at", "expires_at", "is_paid", "has_billing_id" } }`, or 404 with a `message` when the company has no subscription row. No Stripe id or internal row id SHALL be exposed.

#### Scenario: Trial company

- **WHEN** a company in its trial reads its status
- **THEN** `is_paid` is `false`, `has_billing_id` is `false` until a Stripe customer exists, and `expires_at` is the trial end

### Requirement: Paid versus trial semantics

The system SHALL report `is_paid: true` whenever the subscription row is linked to a Stripe subscription, including after that subscription has ended, and `has_billing_id: true` whenever the company has a Stripe customer. Whether access is currently granted SHALL be determined by `expires_at` being in the future.

#### Scenario: Paid subscription ended

- **WHEN** a company's Stripe subscription was cancelled and its end date has passed
- **THEN** the status still reads `is_paid: true` with an `expires_at` in the past, which clients treat as inactive

### Requirement: Create the Stripe customer

The system SHALL expose `POST /api/v1/billing` (requires `billing.manage`) that creates a Stripe customer for the company with the caller's email and the company id as metadata and responds 201 with `{}`; it SHALL respond 409 with a `message` when the company already has one. Concurrent creations SHALL converge on a single stored customer.

#### Scenario: Customer already exists

- **WHEN** an owner calls `POST /api/v1/billing` for a company with a Stripe customer
- **THEN** the API responds 409

### Requirement: Checkout input

The system SHALL expose `POST /api/v1/billing/checkout-session` (requires `billing.manage`) taking `planName` (`basic` or `pro`) and `planBillingCycle` (`monthly` or `yearly`) from the JSON body; any other or missing body value, including a value sent only in the query string, SHALL respond 422 and never a server error.

#### Scenario: Unknown plan

- **WHEN** `planName` is `enterprise`
- **THEN** the API responds 422

#### Scenario: Plan sent in the query string

- **WHEN** an owner calls `POST /api/v1/billing/checkout-session?planName=pro&planBillingCycle=monthly` with an empty body
- **THEN** the API responds 422 and no Stripe call is made

### Requirement: Checkout refuses an already-subscribed company

The system SHALL respond 409 with `code: "SUBSCRIPTION_ACTIVE"` when the stored row is linked to a Stripe subscription with an unexpired `expires_at`, or when Stripe reports any `active`, `trialing` or `past_due` subscription for the company's customer (covering a webhook still in flight). Plan changes go through the customer portal instead.

#### Scenario: Webhook not yet processed

- **WHEN** a checkout completed in another tab but the local row still shows the trial
- **THEN** a new checkout request responds 409 with `code: "SUBSCRIPTION_ACTIVE"`

### Requirement: Checkout session reuse

For a company with a Stripe customer, the system SHALL reuse the newest open Checkout session with the same plan, cycle and price id that has more than 10 minutes left, responding 200 with its URL, and SHALL expire every other open Checkout session of the customer so at most one can complete.

#### Scenario: Double submit

- **WHEN** an owner requests the same plan twice within a few minutes
- **THEN** both responses carry the same `checkoutSessionUrl`

#### Scenario: Plan switch before paying

- **WHEN** an owner opens a monthly checkout and then requests a yearly one
- **THEN** the monthly session is expired and a new yearly session is returned

### Requirement: Checkout session creation

Otherwise the system SHALL create the Stripe customer if missing and a hosted subscription-mode Checkout session for the plan's price (quantity 1) with the company id as client reference, plan, cycle, price, user and company metadata, promotion codes, automatic tax and tax-id collection, returning to `/user/billing?status=paid` or `?status=cancelled`. It SHALL respond 200 with `{ "checkoutSessionUrl" }`.

#### Scenario: First checkout

- **WHEN** an owner of a trial company without a Stripe customer starts a checkout
- **THEN** a Stripe customer is created and stored, and the API responds 200 with a Stripe-hosted checkout URL

### Requirement: Concurrent checkout conflicts

The system SHALL respond 409 with `code: "CHECKOUT_IN_PROGRESS"` when Stripe reports an idempotency conflict for the checkout request, so the client can retry.

#### Scenario: Idempotency conflict

- **WHEN** Stripe answers the session creation with an idempotency error
- **THEN** the API responds 409 with `code: "CHECKOUT_IN_PROGRESS"`

### Requirement: Customer portal

The system SHALL expose `POST /api/v1/billing/customer-portal` (requires `billing.manage`) responding 200 with `{ "customerPortalUrl" }` for a Stripe billing-portal session that returns to `/user/billing`, and 409 with a `message` when the company has no Stripe customer. The portal SHALL remain reachable after the subscription has ended.

#### Scenario: No customer yet

- **WHEN** an owner of a trial company that never started a checkout requests the portal
- **THEN** the API responds 409

### Requirement: Webhook signature verification

The system SHALL accept Stripe events at `POST /webhooks/v1/stripe` on the raw request body and verify the Stripe signature with the configured webhook secret; an invalid signature or payload SHALL respond 400 with a generic `message` and be logged as a warning, not an alert.

#### Scenario: Forged event

- **WHEN** a request without a valid Stripe signature is posted
- **THEN** the API responds 400 and processes nothing

### Requirement: Handled webhook events

The system SHALL sync the subscription on `checkout.session.completed` (only when `payment_status` is `paid` or `no_payment_required`), `checkout.session.async_payment_succeeded`, `invoice.paid` (when the invoice references a subscription) and `customer.subscription.created`, `.updated` and `.deleted`. Other event types SHALL be acknowledged with 200 and ignored.

#### Scenario: Unpaid checkout completion

- **WHEN** `checkout.session.completed` arrives with `payment_status` `unpaid`
- **THEN** the API responds 200 and the subscription is not changed

#### Scenario: Subscription created outside Checkout

- **WHEN** `customer.subscription.created` arrives for an active subscription of a known customer
- **THEN** the company's row is synced without waiting for another event

### Requirement: Webhook sync reads fresh state from Stripe

For every handled event the system SHALL retrieve the subscription from Stripe instead of trusting the event payload, and SHALL resolve the company from the subscription's Stripe customer as stored by this API, never from client-controlled fields.

#### Scenario: Out-of-order delivery

- **WHEN** an older `customer.subscription.updated` is delivered after a newer one
- **THEN** both syncs write the subscription's current Stripe state

### Requirement: Webhook cross-checks customer and company

For Checkout events the system SHALL skip the sync and log an error when the session's customer does not own the subscription, or when the session's client reference differs from the company mapped to the subscription's customer.

#### Scenario: Client reference mismatch

- **WHEN** a completed checkout names company A but its customer belongs to company B
- **THEN** nothing is written and an error is logged

### Requirement: Webhook for unknown or deleted companies

The system SHALL acknowledge with 200 an event whose customer maps to no company, logging an error naming the subscription and customer for manual cancellation when the subscription grants access (`active`, `trialing`, `past_due`) and a warning otherwise. Events whose company or Stripe resource disappears during processing SHALL also be acknowledged with 200 and a warning.

#### Scenario: Checkout completed after company deletion

- **WHEN** a checkout completes for a customer whose company was deleted
- **THEN** the API responds 200 and an orphan-subscription error is logged

### Requirement: Webhook write rules

Under the company lock the system SHALL write the subscription id, Stripe status, sync time and `expires_at` (current period end for access-granting statuses; end date, or now, for `canceled`, `unpaid`, `incomplete_expired`, `paused`), creating the row if missing and never deleting it. Other statuses, such as `incomplete`, SHALL be skipped.

#### Scenario: Subscription cancelled

- **WHEN** `customer.subscription.deleted` arrives for the company's tracked subscription
- **THEN** `expires_at` moves to the end date and the row remains so the company can resubscribe

#### Scenario: Incomplete subscription

- **WHEN** a subscription event arrives with status `incomplete`
- **THEN** nothing is written

### Requirement: Only one subscription owns the row

When an event concerns a subscription other than the tracked one, the system SHALL let it replace the row only if it grants access and the tracked one is not an unexpired paid subscription. If both grant access it SHALL skip the write and log a possible-double-billing error; other mismatches SHALL be skipped silently.

#### Scenario: Trial upgraded

- **WHEN** the first paid subscription of a trial company syncs
- **THEN** it takes over the row and `is_paid` becomes `true`

#### Scenario: Second active subscription

- **WHEN** an event reports another active subscription while the tracked one is still paid and unexpired
- **THEN** the row is unchanged and a double-billing error is logged

### Requirement: Stale webhook writes are dropped

The system SHALL record when each stored state was read from Stripe and SHALL drop a write for the same subscription whose Stripe read started before the stored one, so the freshest read wins regardless of commit order.

#### Scenario: Slow delivery

- **WHEN** a sync whose Stripe read started earlier commits after a sync with a later read
- **THEN** the earlier read's write is discarded

### Requirement: Webhook failures are retried by Stripe

The system SHALL respond 500 when processing a handled event fails for any other reason (for example a database error), so Stripe retries the delivery, and SHALL respond 200 once the event is processed or deliberately skipped.

#### Scenario: Database outage

- **WHEN** the subscription write fails because the database is unavailable
- **THEN** the API responds 500

### Requirement: Company deletion tears down Stripe billing

After a company deletion commits (see `account`), the system SHALL expire every open Checkout session of the company's Stripe customer, then cancel at period end every access-granting subscription of that customer not already set to cancel, falling back to the stored subscription when the customer cannot be listed. The customer SHALL be kept.

#### Scenario: Last member deletes the account

- **WHEN** the only member of a paying company deletes their account
- **THEN** the company's open checkouts are expired and its subscription is set to cancel at the end of the paid period

### Requirement: Stripe teardown is best-effort

Each failed teardown step SHALL be logged as an error with the ids needed to finish it manually and SHALL never fail or roll back the deletion that triggered it.

#### Scenario: Stripe unavailable during teardown

- **WHEN** Stripe is unreachable after a company deletion commits
- **THEN** the deletion still succeeds and an error with the customer and subscription ids is logged

### Requirement: Billing page status

The SPA's billing page SHALL show the status as paid (`is_paid` with a future expiry), trial (`is_paid: false` with a future expiry) or inactive (no row, 404, or a past expiry), with the expiry or trial-end date when present. It SHALL show a specific error for `COMPANY_MEMBERSHIP_REQUIRED` and a generic error for other load failures.

#### Scenario: Trial company

- **WHEN** a trial company opens the billing page
- **THEN** the page shows the trial status, the trial end date and the plan offer

### Requirement: Billing page actions

The SPA SHALL offer the Pro monthly plan checkout whenever the company is not on a paid subscription and the customer portal only when `has_billing_id` is true. Both SHALL be locked with an explanation once permissions show the caller lacks `billing.manage`. The SPA SHALL only navigate to URLs on Stripe's checkout and billing domains.

#### Scenario: Admin views billing

- **WHEN** a `company_admin` opens the billing page
- **THEN** the checkout and portal buttons are disabled with a permission explanation

#### Scenario: Unexpected redirect URL

- **WHEN** the checkout response carries a URL outside Stripe's checkout domain
- **THEN** the SPA does not navigate and shows an error

### Requirement: Billing page checkout outcomes

The SPA SHALL show a specific message for 409 `SUBSCRIPTION_ACTIVE`, a permission message for 403, an invalid-request message for other 400/409/422 responses and a generic error otherwise. On return with `status=paid` it SHALL notify success and re-check the status every 2 seconds up to 5 times, saying payment is still processing if it never turns paid; `status=cancelled` SHALL show a notice. The parameter SHALL be removed after handling.

#### Scenario: Webhook lags behind the redirect

- **WHEN** the user returns with `status=paid` and the status stays unpaid after five re-checks
- **THEN** the page tells the user the payment is still being processed
