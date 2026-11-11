import { SUPPORTED_PLANS, SUPPORTED_BILLING_CYCLES } from '../../config/planPrices.js';

export const checkoutSessionSchema = {
  planName: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Plan name is required',
    },
    isString: {
      errorMessage: 'Plan name must be a string',
    },
    isIn: {
      options: [SUPPORTED_PLANS],
      errorMessage: `Plan name must be one of: ${SUPPORTED_PLANS.join(', ')}`,
    },
  },
  planBillingCycle: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Billing cycle is required',
    },
    isString: {
      errorMessage: 'Billing cycle must be a string',
    },
    isIn: {
      options: [SUPPORTED_BILLING_CYCLES],
      errorMessage: `Billing cycle must be one of: ${SUPPORTED_BILLING_CYCLES.join(', ')}`,
    },
  },
};
