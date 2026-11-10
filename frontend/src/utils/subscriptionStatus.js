//* Single definition of a subscription's state, shared by SubscriptionContext
//* (the user's own company) and SubscriptionStatusBadge (admin lists):
//* - 'paid':     `is_paid` and `expires_at` in the future (Stripe subscription)
//* - 'trial':    `is_paid === false`, `expires_at` in the future (free trial)
//* - 'active':   `expires_at` in the future but the payload carries no
//*               `is_paid` (admin endpoints) - running, paid or trial unknown
//* - 'inactive': no subscription, or `expires_at` missing / in the past
export const subscriptionStatus = (subscription, now = new Date()) => {
  const expiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null;
  const expiresInFuture = Boolean(expiresAt && expiresAt.getTime() > now.getTime());

  if (!expiresInFuture) {
    return 'inactive';
  }

  if (subscription.is_paid === true) {
    return 'paid';
  }

  return subscription.is_paid === false ? 'trial' : 'active';
};

export default subscriptionStatus;
