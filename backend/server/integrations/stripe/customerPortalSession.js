import { stripeInstance } from '../../config/stripe.js';
import { frontendUrl } from '../../utils/frontendUrl.js';

export const createStripeCustomerPortalSession = async (stripeCustomerId) => {
  const customerPortalSession = await stripeInstance.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: frontendUrl('/user/billing'),
  });
  return customerPortalSession;
};

//* Portal sessions are temporary. New portal sessions expire after a 5 minute period.
//* If a customer uses it within that time period, the session expires
//* within 1 hour of the most recent activity.

//* DOCS --> https://docs.stripe.com/api/customer_portal/sessions/create
