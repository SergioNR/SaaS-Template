# Spec Delta

## ADDED Requirements

### Requirement: SPA subscription state labels

The SPA SHALL derive a subscription's displayed state only from the server's `status`: `paid` shown as active, `trial` as the free trial, and `inactive` - also for a missing subscription or an unknown or missing `status` - as inactive. The same label SHALL be used on the user pages and the admin pages.

#### Scenario: Paid company in the admin list

- **WHEN** a superadmin lists companies and one has `status: paid`
- **THEN** its badge reads the same active label the company's own billing page shows

#### Scenario: Unknown status

- **WHEN** a payload carries a subscription without a recognised `status`
- **THEN** the SPA shows it as inactive and never infers paid state from dates or `is_paid`

## MODIFIED Requirements

### Requirement: Checkout session creation

Otherwise the system SHALL create the Stripe customer if missing and a hosted subscription-mode Checkout session for the plan's price (quantity 1) with the company id as client reference, plan, cycle, price, user and company metadata, promotion codes, automatic tax and tax-id collection, returning to `/user/billing?status=paid` or `?status=cancelled` on the front-end origin. It SHALL respond 200 with `{ "checkoutSessionUrl" }`.

#### Scenario: First checkout

- **WHEN** an owner of a trial company without a Stripe customer starts a checkout
- **THEN** a Stripe customer is created and stored, and the API responds 200 with a Stripe-hosted checkout URL

#### Scenario: Configured origin with a trailing slash

- **WHEN** the front-end origin is configured as `https://app.example.com/`
- **THEN** the session returns to `https://app.example.com/user/billing?status=paid` or `?status=cancelled`, never a `//` path

### Requirement: Customer portal

The system SHALL expose `POST /api/v1/billing/customer-portal` (requires `billing.manage`) responding 200 with `{ "customerPortalUrl" }` for a Stripe billing-portal session that returns to `/user/billing` on the front-end origin, and 409 with a `message` when the company has no Stripe customer. The portal SHALL remain reachable after the subscription has ended.

#### Scenario: No customer yet

- **WHEN** an owner of a trial company that never started a checkout requests the portal
- **THEN** the API responds 409

#### Scenario: Return URL ignores a configured path

- **WHEN** the front-end URL is configured with a path, such as `https://app.example.com/base/`
- **THEN** the portal returns to `https://app.example.com/user/billing`

### Requirement: Billing page checkout outcomes

The SPA SHALL show a specific message for 409 `SUBSCRIPTION_ACTIVE`, a retry-shortly message for 409 `CHECKOUT_IN_PROGRESS`, a permission message for 403, an invalid-request message for other 400/409/422 responses and a generic error otherwise. On return with `status=paid` it SHALL notify success and re-check the status every 2 seconds up to 5 times, saying payment is still processing if it never turns paid; `status=cancelled` SHALL show a notice. The parameter SHALL be removed after handling.

#### Scenario: Webhook lags behind the redirect

- **WHEN** the user returns with `status=paid` and the status stays unpaid after five re-checks
- **THEN** the page tells the user the payment is still being processed

#### Scenario: Checkout already in progress

- **WHEN** starting a checkout answers 409 with `code: "CHECKOUT_IN_PROGRESS"`
- **THEN** the page asks the user to wait a few seconds and retry instead of reporting invalid data
