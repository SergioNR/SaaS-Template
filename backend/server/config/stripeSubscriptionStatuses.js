//* Stripe subscription statuses that grant access until the end of the
//* current billing period (past_due keeps access while Stripe retries the
//* payment). Shared by the webhook sync and the pre-checkout "already
//* subscribed" check so both agree on what counts as subscribed
export const ACCESS_GRANTING_STATUSES = ['active', 'trialing', 'past_due'];

//* Statuses after which the subscription no longer grants access
export const ENDED_STATUSES = ['canceled', 'unpaid', 'incomplete_expired', 'paused'];

//* The ONE definition of "the stored row is an active paid subscription",
//* shared by the checkout guard and the webhook sync: the row tracks a real
//* Stripe subscription (trial rows have no `stripe_subscription_id`) whose
//* `expires_at` is still in the future
export const isStoredSubscriptionActive = (storedSubscription, now = new Date()) => Boolean(
  storedSubscription?.stripe_subscription_id
  && storedSubscription.expires_at
  && new Date(storedSubscription.expires_at) > now,
);
