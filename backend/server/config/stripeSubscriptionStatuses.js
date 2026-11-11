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

//* The client-facing subscription state, computed from the stored row so the
//* Stripe subscription id never has to leave the model:
//* - 'paid': Stripe-backed and unexpired (isStoredSubscriptionActive)
//* - 'trial': not Stripe-backed and unexpired
//* - 'inactive': expired, or no expiry at all
export const storedSubscriptionStatus = (storedSubscription, now = new Date()) => {
  if (isStoredSubscriptionActive(storedSubscription, now)) {
    return 'paid';
  }

  if (storedSubscription?.expires_at && new Date(storedSubscription.expires_at) > now) {
    return 'trial';
  }

  return 'inactive';
};

//* Public subscription shape shared by every payload (billing read, admin
//* user/company detail and company list): dates plus the derived `status`
//* and `is_paid` (exactly `status === 'paid'`). The row id and the Stripe
//* subscription id are dropped here. Null in, null out
export const toPublicSubscription = (storedSubscription, now = new Date()) => {
  if (!storedSubscription) {
    return null;
  }

  const {
    id: _rowId,
    stripe_subscription_id: _stripeSubscriptionId,
    ...publicFields
  } = storedSubscription;
  const status = storedSubscriptionStatus(storedSubscription, now);

  return {
    ...publicFields,
    status,
    is_paid: status === 'paid',
  };
};
