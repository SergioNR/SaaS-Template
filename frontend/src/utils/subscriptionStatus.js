const SERVER_STATUSES = ['paid', 'trial', 'inactive'];

//* Single definition of a subscription's state, shared by SubscriptionContext
//* (the user's own company) and SubscriptionStatusBadge (admin lists). Every
//* API payload carries a server-computed `status` (`paid` | `trial` |
//* `inactive`), so client clock skew never contradicts the server. A missing
//* subscription (or an unknown value) is 'inactive'
export const subscriptionStatus = (subscription) =>
  SERVER_STATUSES.includes(subscription?.status) ? subscription.status : 'inactive';

export default subscriptionStatus;
