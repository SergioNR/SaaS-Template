import { randomUUID } from 'node:crypto';
import { stripeInstance } from '../../config/stripe.js';
import { getStripePriceId } from '../../config/planPrices.js';
import { frontendUrl } from '../../utils/frontendUrl.js';

//* An open session is only worth reusing while the customer still has time to
//* finish it - one about to expire is replaced by a fresh one instead
const MIN_REMAINING_SESSION_LIFETIME_MS = 10 * 60 * 1000;

const isReusableSession = (session, planName, planBillingCycle, priceId) => (
  session.metadata?.planName === planName
  && session.metadata?.planBillingCycle === planBillingCycle
  && session.metadata?.priceId === priceId
  && Boolean(session.url)
  && session.expires_at * 1000 > Date.now() + MIN_REMAINING_SESSION_LIFETIME_MS
);

//* An open session can still be completed by the customer after a newer one
//* was created, which would end in two subscriptions - so at most one open
//* session per customer survives this call. A session for the same plan,
//* cycle and price is reused (a double-submit or a second tab lands on the
//* same checkout); every other open session is expired. Resolves to the
//* reusable session, or null when a new one has to be created
export const reuseOrExpireOpenStripeCheckoutSessions = async (stripeCustomerId, planName, planBillingCycle) => {
  const priceId = getStripePriceId(planName, planBillingCycle);

  const openSessions = await stripeInstance.checkout.sessions.list({
    customer: stripeCustomerId,
    status: 'open',
    limit: 100,
  });

  //* Stripe lists newest first, so the newest matching session is reused
  const reusableSession = openSessions.data
    .find((session) => isReusableSession(session, planName, planBillingCycle, priceId)) ?? null;

  const staleSessions = openSessions.data.filter((session) => session !== reusableSession);

  await Promise.all(staleSessions.map((session) => stripeInstance.checkout.sessions.expire(session.id)));

  return reusableSession;
};

//* Stripe answers a concurrent request on the same idempotency key, or one
//* whose parameters differ from the key's first use, with an idempotency
//* error / 409 - a conflict for the client to retry, not a server fault
export const isStripeCheckoutConflictError = (error) => (
  error?.type === 'StripeIdempotencyError' || error?.statusCode === 409
);

export const createStripeCheckoutSession = async (
  companyId,
  companyStripeId,
  userId,
  planName,
  planBillingCycle,
) => {
  const priceId = getStripePriceId(planName, planBillingCycle);

  const checkoutSession = await stripeInstance.checkout.sessions.create({
    success_url: frontendUrl('/user/billing', { status: 'paid' }),
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    customer: companyStripeId,
    customer_update: {
      name: 'auto',
      address: 'auto',
    },
    mode: 'subscription',
    cancel_url: frontendUrl('/user/billing', { status: 'cancelled' }),
    client_reference_id: companyId,
    adaptive_pricing: {
      enabled: true,
    },
    automatic_tax: {
      enabled: true,
    },
    metadata: {
      planName: planName,
      planBillingCycle: planBillingCycle,
      //* Lets a later request recognize a reusable open session even after
      //* the plan's price id was reconfigured
      priceId: priceId,
      userId: userId,
      companyId: companyId,
    },
    ui_mode: 'hosted',
    allow_promotion_codes: true,
    billing_address_collection: 'auto', //* Disable this for non-corporate users
    tax_id_collection: { //* Disable this for non-corporate users
      enabled: true,
    },
  }, {
    //* Per request: only a network retry of this very call replays it. Reuse
    //* across requests is decided by reuseOrExpireOpenStripeCheckoutSessions,
    //* never by a shared key - a replayed key would hand back a session that
    //* was expired in the meantime
    idempotencyKey: randomUUID(),
  });

  return checkoutSession;
};

//* Checkout Sessions are temporary. New Checkout Sessions expire after a 24 hour period.
//* The expiration time can be overwritten via the `expires_at` attribute
//* It can also be expired via the dedicated session expiration endpoint
//* DOCS --> https://docs.stripe.com/api/checkout/sessions
//* DOCS --> https://docs.stripe.com/api/checkout/sessions/list
//* DOCS --> https://docs.stripe.com/api/checkout/sessions/expire
//* DOCS --> https://docs.stripe.com/api/idempotent_requests
//* Interactive Shell --> https://docs.stripe.com/api/checkout/sessions/create?shell=true&api=true&resource=checkout%20sessions&action=create
