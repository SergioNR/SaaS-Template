import { logError, logInfo, logWarn } from '../../config/loggerFunctions.js';
import {
  getCompanyIdByStripeCustomerIdInDb,
  syncSubscriptionWithCompanyLockInDb,
} from '../../models/subscriptionModel.js';
import { stripeInstance } from '../../config/stripe.js';
import {
  ACCESS_GRANTING_STATUSES,
  ENDED_STATUSES,
  isStoredSubscriptionActive,
} from '../../config/stripeSubscriptionStatuses.js';
import { retrieveStripeSubscription } from '../../integrations/stripe/subscription.js';
import { getPlanForStripePriceId } from '../../config/planPrices.js';
import { trackBackground } from '../../utils/processLifecycle.js';
import { notifySubscriptionTransition } from '../../utils/businessEvents.js';

const getStripeObjectId = (value) => (typeof value === 'string' ? value : value?.id ?? null);

//* Stripe ids are internal - alerts only carry enough of them to find the
//* objects in the dashboard, never the full id
const redactStripeId = (stripeId) => (stripeId ? `${stripeId.slice(0, 4)}...${stripeId.slice(-4)}` : 'none');

//* Since Stripe API 2025-03-31 the billing period lives on each subscription
//* item instead of the subscription itself. The latest item period end wins;
//* the top-level field is kept as a fallback for older pinned API versions
const getSubscriptionPeriodEnd = (subscription) => {
  const itemPeriodEnds = (subscription.items?.data ?? [])
    .map((item) => item.current_period_end)
    .filter(Boolean);

  const periodEnd = itemPeriodEnds.length > 0
    ? Math.max(...itemPeriodEnds)
    : subscription.current_period_end;

  return periodEnd ? new Date(periodEnd * 1000) : null;
};

const getSubscriptionExpiresAt = (subscription) => {
  if (ENDED_STATUSES.includes(subscription.status)) {
    return subscription.ended_at ? new Date(subscription.ended_at * 1000) : new Date();
  }

  return getSubscriptionPeriodEnd(subscription);
};

//* Decides, with the company row locked and the stored row in hand, what to
//* write for the (already fetched) Stripe subscription. Pure - no I/O runs
//* under the lock. Returns the write for the model or null to skip
export const resolveSubscriptionWrite = (subscription, storedSubscription, {
  eventType,
  companyId,
  syncedAt,
}) => {
  const isSameSubscription = storedSubscription?.stripe_subscription_id === subscription.id;

  if (!isSameSubscription) {
    //* Only a subscription that grants access may take over the row - a stale
    //* event for an old (ended) subscription must not clobber the current one.
    //* Trial rows and ended subscriptions can be replaced, an active one cannot
    const canReplace = ACCESS_GRANTING_STATUSES.includes(subscription.status)
      && !isStoredSubscriptionActive(storedSubscription);

    if (!canReplace) {
      //* Two subscriptions granting access at once means the customer is
      //* being billed twice - that needs a human, so it is alerted, not ignored
      if (ACCESS_GRANTING_STATUSES.includes(subscription.status)) {
        logError(
          `Company ${companyId} has an active subscription ${redactStripeId(storedSubscription?.stripe_subscription_id)} but Stripe reports another access-granting subscription ${redactStripeId(subscription.id)} (${eventType}, status ${subscription.status}) - possible double billing`,
          new Error('Duplicate active Stripe subscription'),
          eventType,
        );
        return null;
      }

      logInfo(`Ignoring ${eventType} for subscription ${redactStripeId(subscription.id)} (status ${subscription.status}) - company ${companyId} tracks a different subscription`);
      return null;
    }
  }

  //* Incomplete subscriptions have not been paid yet - wait for the payment events
  if (!ACCESS_GRANTING_STATUSES.includes(subscription.status)
    && !ENDED_STATUSES.includes(subscription.status)) {
    logInfo(`Ignoring ${eventType} for subscription ${redactStripeId(subscription.id)} with status ${subscription.status}`);
    return null;
  }

  return {
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    expiresAt: getSubscriptionExpiresAt(subscription),
    syncedAt,
  };
};

const getSubscriptionPlan = (subscription) => getPlanForStripePriceId(
  subscription?.items?.data?.[0]?.price?.id ?? null,
);

//* Was cancellation off before this update? `previous_attributes` only holds
//* the fields that changed - the trigger, confirmed by the fresh read below
const wasCancellationUnset = (previousAttributes) => Boolean(previousAttributes) && (
  (Object.hasOwn(previousAttributes, 'cancel_at_period_end') && previousAttributes.cancel_at_period_end === false)
  || (Object.hasOwn(previousAttributes, 'cancel_at') && previousAttributes.cancel_at === null)
);

const isCancellationSet = (subscription) => subscription?.cancel_at_period_end === true || Boolean(subscription?.cancel_at);

//* Did the stored row grant access through this same subscription? Rows
//* synced before `stripe_status` existed have no status - their expiry decides
const previouslyGrantedAccess = (previous, written) => {
  if (!previous || previous.stripe_subscription_id !== written.stripeSubscriptionId) {
    return false;
  }

  if (previous.stripe_status) {
    return ACCESS_GRANTING_STATUSES.includes(previous.stripe_status);
  }

  return isStoredSubscriptionActive(previous);
};

//* Pure - classifies a committed sync for the business-events channel.
//* `previous` / `written` come from syncSubscriptionWithCompanyLockInDb
//* (null when the write was skipped or stale - then nothing is emitted).
//* Returns { event, fields } or null
export const classifySubscriptionTransition = (previous, written, {
  eventType,
  previousAttributes = null,
  subscription = null,
} = {}) => {
  if (!written) {
    return null;
  }

  const plan = getSubscriptionPlan(subscription);
  const grantsAccessNow = ACCESS_GRANTING_STATUSES.includes(written.status);
  const grantedAccessBefore = previouslyGrantedAccess(previous, written);

  if (grantsAccessNow && !grantedAccessBefore) {
    return {
      event: 'subscription.started',
      fields: {
        //* A trial row has no Stripe subscription; any earlier paid
        //* subscription (ended, or a different one) makes it a comeback
        startKind: previous?.stripe_subscription_id ? 'resubscribed' : 'converted',
        plan,
        periodEndsAt: written.expiresAt,
      },
    };
  }

  if (grantedAccessBefore && ENDED_STATUSES.includes(written.status)) {
    return {
      event: 'subscription.ended',
      fields: { plan, status: written.status },
    };
  }

  if (eventType === 'customer.subscription.updated'
    && grantsAccessNow
    && wasCancellationUnset(previousAttributes)
    && isCancellationSet(subscription)) {
    return {
      event: 'subscription.cancellation_scheduled',
      fields: {
        plan,
        accessEndsAt: subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : written.expiresAt,
      },
    };
  }

  return null;
};

//* Always derives the state from a fresh Stripe read instead of the event
//* payload, so out-of-order or retried deliveries converge on the current
//* state. The read happens BEFORE the company lock is taken (a slow Stripe
//* call never holds the lock); the model drops the write if a later read of
//* the same subscription was already stored.
//* The company is resolved from the subscription's Stripe customer - the
//* mapping this API wrote itself - never from client-controlled fields.
//* `expectedCompanyId` (a checkout session's client_reference_id) is only
//* cross-checked against it
const syncSubscriptionFromStripe = async (subscriptionId, eventType, {
  expectedCompanyId = null,
  expectedCustomerId = null,
  previousAttributes = null,
} = {}) => {
  //* Taken before the read starts so it never postdates the state it describes
  const syncedAt = new Date();
  const subscription = await retrieveStripeSubscription(subscriptionId);
  const customerId = getStripeObjectId(subscription.customer);

  if (expectedCustomerId && expectedCustomerId !== customerId) {
    logError(
      `Stripe ${eventType} customer ${redactStripeId(expectedCustomerId)} does not own subscription ${redactStripeId(subscriptionId)} - skipping`,
      new Error('Stripe customer mismatch'),
      eventType,
    );
    return;
  }

  const companyId = await getCompanyIdByStripeCustomerIdInDb(customerId);

  if (!companyId) {
    //* An access-granting subscription without a company is billing someone
    //* for nothing (e.g. a checkout completed after the company was deleted)
    //* - acknowledged so Stripe stops retrying, but paged with the full ids
    //* so it can be cancelled by hand
    if (ACCESS_GRANTING_STATUSES.includes(subscription.status)) {
      logError(
        `Stripe subscription ${redactStripeId(subscriptionId)} (status ${subscription.status}) has no matching company - cancel it manually`,
        new Error('Orphan Stripe subscription'),
        { eventType, stripeSubscriptionId: subscriptionId, stripeCustomerId: customerId },
      );
      return;
    }

    logWarn(`Stripe subscription ${redactStripeId(subscriptionId)} has no matching company - skipping`, new Error('Company not found'), eventType);
    return;
  }

  if (expectedCompanyId && expectedCompanyId !== companyId) {
    //* client_reference_id disagrees with the customer this API linked to the
    //* company - never trust the client-controlled side
    logError(
      `Stripe ${eventType} references company ${expectedCompanyId} but its customer belongs to company ${companyId} - skipping`,
      new Error('Checkout company mismatch'),
      eventType,
    );
    return;
  }

  //* Awaited so a DB failure surfaces as a 500 and Stripe retries the event
  //* instead of treating it as processed
  const syncResult = await syncSubscriptionWithCompanyLockInDb(
    companyId,
    (storedSubscription) => resolveSubscriptionWrite(subscription, storedSubscription, {
      eventType,
      companyId,
      syncedAt,
    }),
  );

  const transition = classifySubscriptionTransition(syncResult?.previous ?? null, syncResult?.written ?? null, {
    eventType,
    previousAttributes,
    subscription,
  });

  //* After the commit, detached - never delays or changes the acknowledgement
  if (transition) {
    trackBackground(notifySubscriptionTransition(companyId, transition));
  }
};

const handleCheckoutSession = async (checkoutSession, eventType) => {
  const subscriptionId = getStripeObjectId(checkoutSession.subscription);

  if (!subscriptionId) {
    logWarn(`${eventType} event without subscription id - skipping`, new Error('Missing subscription id'), checkoutSession.id);
    return;
  }

  await syncSubscriptionFromStripe(subscriptionId, eventType, {
    expectedCompanyId: checkoutSession.client_reference_id,
    expectedCustomerId: getStripeObjectId(checkoutSession.customer),
  });
};

const getInvoiceSubscriptionId = (invoice) => getStripeObjectId(
  invoice.parent?.subscription_details?.subscription ?? invoice.subscription,
);

const isMissingCompanyError = (error) => ['P2003', 'P2025'].includes(error?.code);

const isMissingStripeResourceError = (error) => error?.type === 'StripeInvalidRequestError'
  && error?.code === 'resource_missing';

export const stripeEventHandler = async (req, res) => {
  let event;

  try {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    event = stripeInstance.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    //* Anyone can POST garbage to a public webhook URL - a bad signature is
    //* noise to log, not an incident to page on
    logWarn('Stripe webhook signature verification failed', err, { ip: req.ip });
    //* Generic message - verification details are not echoed back to the caller
    return res.status(400).json({
      message: 'Invalid webhook signature or payload',
    });
  }

  try {
    const eventObject = event.data.object;

    switch (event.type) {
      case 'checkout.session.completed': {
        //* `no_payment_required` covers 100% discounts and free trials
        if (['paid', 'no_payment_required'].includes(eventObject.payment_status)) {
          await handleCheckoutSession(eventObject, event.type);
        }
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        await handleCheckoutSession(eventObject, event.type);
        break;
      }

      case 'invoice.paid': {
        const subscriptionId = getInvoiceSubscriptionId(eventObject);

        if (subscriptionId) {
          await syncSubscriptionFromStripe(subscriptionId, event.type);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        //* `created` covers subscriptions set up outside Checkout (portal plan
        //* changes, API calls) so they sync without waiting for a later
        //* `updated` or `invoice.paid`. Deletion keeps the row and moves
        //* expires_at to the end date, so the company can still resubscribe
        //* and reach the customer portal
        // TODO -- send an email to the user about the subscription end
        await syncSubscriptionFromStripe(eventObject.id, event.type, {
          previousAttributes: event.data.previous_attributes ?? null,
        });
        break;
      }

      default:
      // console.log('Unhandled event type:', event.type); //* Activate for debugging
    }

    return res.status(200).json({});
  } catch (error) {
    //* The company was deleted after the checkout started - retrying would
    //* never succeed, so acknowledge the event instead of looping on 500s
    if (isMissingCompanyError(error)) {
      logWarn(`Stripe event ${event.id} references a company that no longer exists - acknowledging`, error, event.type);
      return res.status(200).json({});
    }

    if (isMissingStripeResourceError(error)) {
      logWarn(`Stripe event ${event.id} references a Stripe resource that no longer exists - acknowledging`, error, event.type);
      return res.status(200).json({});
    }

    logError('error in stripeEventHandler', error);
    return res.status(500).json({});
  }
};

//* DOCS --> https://docs.stripe.com/webhooks
//* DOCS --> https://docs.stripe.com/billing/subscriptions/webhooks
