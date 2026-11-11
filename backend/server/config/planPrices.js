import { requireEnv } from './requiredEnv.js';

const FALLBACK_PRICE_ID = process.env.STRIPE_PRICE_ID;

//* Env var holding the plan-specific price id of each (plan, billing cycle)
const PLAN_PRICE_ENV_VARS = {
  basic: {
    monthly: 'STRIPE_PRICE_ID_BASIC_MONTHLY',
    yearly: 'STRIPE_PRICE_ID_BASIC_YEARLY',
  },
  pro: {
    monthly: 'STRIPE_PRICE_ID_PRO_MONTHLY',
    yearly: 'STRIPE_PRICE_ID_PRO_YEARLY',
  },
};

//* Maps a (planName, planBillingCycle) pair to the Stripe price id configured
//* in the environment. Falls back to STRIPE_PRICE_ID when no plan-specific
//* override exists so single-plan deployments keep working unchanged.
const PLAN_PRICE_MAP = Object.fromEntries(Object.entries(PLAN_PRICE_ENV_VARS)
  .map(([planName, cycles]) => [
    planName,
    Object.fromEntries(Object.entries(cycles)
      .map(([cycle, envVar]) => [cycle, process.env[envVar] || FALLBACK_PRICE_ID])),
  ]));

export const SUPPORTED_PLANS = Object.keys(PLAN_PRICE_MAP);

export const SUPPORTED_BILLING_CYCLES = ['monthly', 'yearly'];

//* Boot-time check (called from config/stripe.js): every advertised plan and
//* cycle must resolve to a price id, either its own or the STRIPE_PRICE_ID
//* fallback - otherwise the first checkout for it would 500. Throws outside
//* localhost through requireEnv, only warns on localhost
export const assertPlanPricesConfigured = () => {
  for (const [planName, cycles] of Object.entries(PLAN_PRICE_ENV_VARS)) {
    for (const [cycle, envVar] of Object.entries(cycles)) {
      if (!PLAN_PRICE_MAP[planName][cycle]) {
        requireEnv(envVar, `no Stripe price id for plan "${planName}" (${cycle}) and no STRIPE_PRICE_ID fallback`);
      }
    }
  }
};

//* Reverse lookup for display only (business events). With the
//* STRIPE_PRICE_ID fallback several plans can share one price id - an
//* ambiguous or unknown id resolves to null instead of a guess
export const getPlanForStripePriceId = (priceId) => {
  if (!priceId) {
    return null;
  }

  const matches = Object.entries(PLAN_PRICE_MAP).flatMap(([planName, cycles]) => Object.entries(cycles)
    .filter(([, cyclePriceId]) => cyclePriceId === priceId)
    .map(([planBillingCycle]) => ({ planName, planBillingCycle })));

  return matches.length === 1 ? matches[0] : null;
};

export const getStripePriceId = (planName, planBillingCycle) => {
  const priceId = PLAN_PRICE_MAP[planName]?.[planBillingCycle];

  if (!priceId) {
    throw new Error(`No Stripe price id configured for plan "${planName}" (${planBillingCycle})`);
  }

  return priceId;
};
