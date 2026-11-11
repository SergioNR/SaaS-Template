const SERVER_STATUSES = ['paid', 'trial', 'inactive'];

//* Single definition of a subscription's state, shared by SubscriptionContext
//* (the user's own company) and SubscriptionStatusBadge (admin lists). Every
//* API payload carries a server-computed `status` (`paid` | `trial` |
//* `inactive`) - it wins when present, so client clock skew never contradicts
//* the server. The date-based fallback only serves older API versions:
//* - 'paid':     `is_paid` and `expires_at` in the future (Stripe subscription)
//* - 'trial':    `is_paid === false`, `expires_at` in the future (free trial)
//* - 'active':   `expires_at` in the future but the payload carries neither
//*               `status` nor `is_paid` - running, paid or trial unknown
//* - 'inactive': no subscription, or `expires_at` missing / in the past
export const subscriptionStatus = (subscription, now = new Date()) => {
  if (SERVER_STATUSES.includes(subscription?.status)) {
    return subscription.status;
  }

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
