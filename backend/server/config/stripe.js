import Stripe from 'stripe';
import { requireEnv } from './requiredEnv.js';
import { assertPlanPricesConfigured } from './planPrices.js';

//* Fail fast - without these the billing endpoints and the webhook cannot work,
//* and a missing webhook secret would make every Stripe event fail verification
const hasStripeApiKey = requireEnv('STRIPE_API_KEY', 'refusing to start without Stripe credentials');
requireEnv('STRIPE_WEBHOOK_SECRET', 'refusing to start without webhook signature verification');
assertPlanPricesConfigured();

//* The SDK throws without a key, so localhost gets a placeholder that Stripe
//* rejects on use - billing calls fail while the rest of the API keeps working
//* The SDK default is an 80s timeout. Checkout requests and the webhook sync
//* (which reads Stripe before taking the company lock) must fail fast rather
//* than hold a request or a Stripe delivery open: 8s per attempt plus a
//* single retry (the SDK reuses the idempotency key on retries)
export const stripeInstance = new Stripe(hasStripeApiKey ? process.env.STRIPE_API_KEY : 'sk_test_unset_on_localhost', {
//   apiVersion: '2022-11-15', //* Optional
  timeout: 8000,
  maxNetworkRetries: 1,
});
