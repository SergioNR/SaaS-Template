import { stripeInstance } from '../../config/stripe.js';
import { logError } from '../../config/loggerFunctions.js';
import { ACCESS_GRANTING_STATUSES } from '../../config/stripeSubscriptionStatuses.js';

export const retrieveStripeSubscription = async (subscriptionId) => {
  const subscription = await stripeInstance.subscriptions.retrieve(subscriptionId);

  return subscription;
};

//* Stripe is the source of truth for "already subscribed" - the local row can
//* lag behind (webhook still in flight) and a second checkout would create a
//* duplicate subscription for the same customer. Every access-granting status
//* counts (a trialing or past_due subscription is still a subscription) - the
//* same set the webhook sync uses. A customer normally holds one or two
//* subscriptions, so the first page is enough
export const hasActiveStripeSubscription = async (stripeCustomerId) => {
  const subscriptions = await stripeInstance.subscriptions.list({
    customer: stripeCustomerId,
    status: 'all',
    limit: 10,
  });

  return subscriptions.data.some((subscription) => ACCESS_GRANTING_STATUSES.includes(subscription.status));
};

//* Billing teardown after a company was deleted (called after the DB commit).
//* The stored row only knows ONE subscription, but the customer can hold more:
//* a checkout completed in another tab, or one completed while the deletion
//* ran. So the customer itself is cleaned up, in this order:
//* 1. every open Checkout Session is expired - none can complete any more
//* 2. every access-granting subscription of the customer is cancelled at
//*    period end (the current, already paid period is not refunded) - listed
//*    after step 1 so a checkout that completed meanwhile is included
//* The customer is kept (not deleted): deleting it cancels immediately and
//* removes the invoice history from the portal and dashboard.
//* Best-effort: a Stripe failure must not undo a committed deletion, so every
//* failed step is logError-ed with the full ids needed to finish it by hand,
//* and nothing is thrown
export const cancelCompanyBillingInStripe = async ({
  companyId = null,
  stripeCustomerId = null,
  stripeSubscriptionId = null,
} = {}) => {
  if (!stripeCustomerId && !stripeSubscriptionId) {
    return;
  }

  const retryInfo = { companyId, stripeCustomerId, stripeSubscriptionId };

  const logFailedStep = (step, error, extraInfo = {}) => logError(
    `Stripe cleanup after deleting company ${companyId} failed (${step}) - finish it manually`,
    error,
    { ...retryInfo, ...extraInfo },
  );

  if (stripeCustomerId) {
    try {
      const openSessions = await stripeInstance.checkout.sessions.list({
        customer: stripeCustomerId,
        status: 'open',
        limit: 100,
      });

      const expireResults = await Promise.allSettled(openSessions.data
        .map((session) => stripeInstance.checkout.sessions.expire(session.id)));

      expireResults.forEach((result, index) => {
        if (result.status === 'rejected') {
          logFailedStep('expire checkout session', result.reason, { checkoutSessionId: openSessions.data[index].id });
        }
      });
    } catch (error) {
      logFailedStep('list open checkout sessions', error);
    }
  }

  //* Falls back to the stored subscription when the customer cannot be listed
  let subscriptionIdsToCancel = stripeSubscriptionId ? [stripeSubscriptionId] : [];

  if (stripeCustomerId) {
    try {
      const subscriptions = await stripeInstance.subscriptions.list({
        customer: stripeCustomerId,
        status: 'all',
        limit: 100,
      });

      subscriptionIdsToCancel = subscriptions.data
        .filter((subscription) => ACCESS_GRANTING_STATUSES.includes(subscription.status)
          && !subscription.cancel_at_period_end)
        .map((subscription) => subscription.id);
    } catch (error) {
      logFailedStep('list customer subscriptions', error);
    }
  }

  const cancelResults = await Promise.allSettled(subscriptionIdsToCancel
    .map((subscriptionId) => stripeInstance.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    })));

  cancelResults.forEach((result, index) => {
    if (result.status === 'rejected') {
      logFailedStep('cancel subscription at period end', result.reason, { cancelSubscriptionId: subscriptionIdsToCancel[index] });
    }
  });
};

//* DOCS --> https://docs.stripe.com/api/subscriptions/retrieve
//* DOCS --> https://docs.stripe.com/api/subscriptions/list
//* DOCS --> https://docs.stripe.com/api/subscriptions/update
//* DOCS --> https://docs.stripe.com/api/checkout/sessions/expire
