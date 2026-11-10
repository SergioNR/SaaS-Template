import { createStripeCustomerPortalSession } from '../integrations/stripe/customerPortalSession.js';
import { createCompanyIdInStripe } from '../integrations/stripe/customerId.js';
import {
  createStripeCheckoutSession,
  isStripeCheckoutConflictError,
  reuseOrExpireOpenStripeCheckoutSessions,
} from '../integrations/stripe/checkoutSession.js';
import { hasActiveStripeSubscription } from '../integrations/stripe/subscription.js';
import {
  getCompanyStripeIdInDb,
  getSubscriptionDataInDb,
  getSubscriptionPublicDataInDb,
  storeBillingCompanyIdInDb,
} from '../models/subscriptionModel.js';
import { isStoredSubscriptionActive } from '../config/stripeSubscriptionStatuses.js';

//* Creates the Stripe customer and stores it with a conditional write. When a
//* concurrent request stored a customer first, the stored id is reused
const createAndStoreCompanyStripeId = async (email, companyId) => {
  const companyBillingId = await createCompanyIdInStripe(email, companyId);

  return storeBillingCompanyIdInDb(companyId, companyBillingId.id);
};

const subscriptionActiveResponse = (res) => res.status(409).json({
  message: 'Company already has an active subscription - manage it through the customer portal',
  code: 'SUBSCRIPTION_ACTIVE',
});

export const createCompanyBillingId = async (req, res) => {
  const {
    email,
    company_id: companyId,
  } = req.user;

  const companyStripeId = await getCompanyStripeIdInDb(companyId);

  if (companyStripeId) {
    return res.status(409).json({
      message: 'Company already has a billing id',
    });
  }

  await createAndStoreCompanyStripeId(email, companyId);

  return res.status(201).json({});
};

export const getBillingCustomerPortalUrl = async (req, res) => {
  const {
    company_id: companyId,
  } = req.user;

  //* Only the Stripe customer is needed - the portal must stay reachable after
  //* the subscription ended so the company can see invoices and resubscribe
  const companyStripeId = await getCompanyStripeIdInDb(companyId);

  if (!companyStripeId) {
    return res.status(409).json({
      message: 'Company has no billing id yet - start a checkout first',
    });
  }

  const customerPortalCreationQuery = await createStripeCustomerPortalSession(companyStripeId);

  const { url } = customerPortalCreationQuery;

  return res.status(200).json({
    customerPortalUrl: url,
  });
};

export const getBillingCheckoutSessionUrl = async (req, res) => {
  const {
    email,
    company_id: companyId,
    id: userId,
  } = req.user;

  const { planName, planBillingCycle } = req.body;

  //* The subscription row is optional - a company whose subscription ended
  //* (or never had one) can still start a new checkout
  const subscriptionData = await getSubscriptionDataInDb(companyId);

  //* A second checkout would create a duplicate Stripe subscription - plan
  //* changes go through the customer portal instead
  //* (shared predicate: a Stripe-backed row that has not expired yet)
  if (isStoredSubscriptionActive(subscriptionData)) {
    return subscriptionActiveResponse(res);
  }

  const storedStripeId = await getCompanyStripeIdInDb(companyId);

  try {
    //* An existing customer may already be subscribed in Stripe while the
    //* local row lags behind (webhook still in flight, or a checkout completed
    //* in a second tab) - Stripe is asked directly before a session is handed
    //* out. An open session for the same plan is reused, any other one is
    //* expired so only one checkout can ever complete
    if (storedStripeId) {
      if (await hasActiveStripeSubscription(storedStripeId)) {
        return subscriptionActiveResponse(res);
      }

      const reusableSession = await reuseOrExpireOpenStripeCheckoutSessions(storedStripeId, planName, planBillingCycle);

      if (reusableSession) {
        return res.status(200).json({
          checkoutSessionUrl: reusableSession.url,
        });
      }
    }

    //* Auto-create the Stripe customer on first checkout - removes the need
    //* for a separate create-billing-id round trip on the client
    const companyStripeId = storedStripeId
      ?? await createAndStoreCompanyStripeId(email, companyId);

    const checkoutSession = await createStripeCheckoutSession(
      companyId,
      companyStripeId,
      userId,
      planName,
      planBillingCycle,
    );

    return res.status(200).json({
      checkoutSessionUrl: checkoutSession.url,
    });
  } catch (error) {
    if (isStripeCheckoutConflictError(error)) {
      return res.status(409).json({
        message: 'A checkout request for this company is already in progress - please retry',
        code: 'CHECKOUT_IN_PROGRESS',
      });
    }

    throw error;
  }
};

export const getCompanySubscriptionData = async (req, res) => {
  const { company_id: companyId } = req.user;

  //* Public shape - no internal Stripe id (customer or subscription) is exposed
  const subscriptionData = await getSubscriptionPublicDataInDb(companyId);

  if (!subscriptionData) {
    return res.status(404).json({
      message: 'No subscription found for the company',
    });
  }

  return res.status(200).json({
    subscriptionData: subscriptionData,
  });
};
