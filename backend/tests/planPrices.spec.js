import { jest } from '@jest/globals';

const PRICE_ENV_VARS = [
  'STRIPE_PRICE_ID',
  'STRIPE_PRICE_ID_BASIC_MONTHLY',
  'STRIPE_PRICE_ID_BASIC_YEARLY',
  'STRIPE_PRICE_ID_PRO_MONTHLY',
  'STRIPE_PRICE_ID_PRO_YEARLY',
];

const originalEnv = {};

describe('planPrices', () => {
  beforeAll(() => {
    PRICE_ENV_VARS.forEach((key) => {
      originalEnv[key] = process.env[key];
    });
  });

  beforeEach(() => {
    PRICE_ENV_VARS.forEach((key) => {
      delete process.env[key];
    });
    jest.resetModules();
  });

  afterAll(() => {
    PRICE_ENV_VARS.forEach((key) => {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    });
  });

  it('maps a plan + billing cycle to its specific price id when configured', async () => {
    process.env.STRIPE_PRICE_ID = 'price_fallback';
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly';

    const { getStripePriceId } = await import('../server/config/planPrices.js');

    expect(getStripePriceId('pro', 'monthly')).toBe('price_pro_monthly');
    expect(getStripePriceId('basic', 'yearly')).toBe('price_fallback');
  });

  it('supports the pro plan advertised on the pricing page for both billing cycles', async () => {
    process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly';
    process.env.STRIPE_PRICE_ID_PRO_YEARLY = 'price_pro_yearly';

    const { getStripePriceId } = await import('../server/config/planPrices.js');

    expect(getStripePriceId('pro', 'monthly')).toBe('price_pro_monthly');
    expect(getStripePriceId('pro', 'yearly')).toBe('price_pro_yearly');
  });

  it('falls back to STRIPE_PRICE_ID for plans without a specific override', async () => {
    process.env.STRIPE_PRICE_ID = 'price_fallback';

    const { getStripePriceId } = await import('../server/config/planPrices.js');

    expect(getStripePriceId('basic', 'monthly')).toBe('price_fallback');
    expect(getStripePriceId('pro', 'yearly')).toBe('price_fallback');
  });

  it('throws when no price id is configured at all', async () => {
    const { getStripePriceId } = await import('../server/config/planPrices.js');

    expect(() => getStripePriceId('basic', 'monthly')).toThrow(/No Stripe price id configured/);
  });

  describe('assertPlanPricesConfigured (boot check)', () => {
    const originalDeployEnvironment = process.env.DEPLOY_ENVIRONMENT;

    afterEach(() => {
      if (originalDeployEnvironment === undefined) {
        delete process.env.DEPLOY_ENVIRONMENT;
      } else {
        process.env.DEPLOY_ENVIRONMENT = originalDeployEnvironment;
      }
    });

    it('throws outside localhost when a plan has neither its own price nor the fallback', async () => {
      process.env.DEPLOY_ENVIRONMENT = 'production';
      process.env.STRIPE_PRICE_ID_PRO_MONTHLY = 'price_pro_monthly';

      const { assertPlanPricesConfigured } = await import('../server/config/planPrices.js');

      expect(() => assertPlanPricesConfigured()).toThrow(/STRIPE_PRICE_ID_BASIC_MONTHLY/);
    });

    it('passes when the fallback covers every plan', async () => {
      process.env.DEPLOY_ENVIRONMENT = 'production';
      process.env.STRIPE_PRICE_ID = 'price_fallback';

      const { assertPlanPricesConfigured } = await import('../server/config/planPrices.js');

      expect(() => assertPlanPricesConfigured()).not.toThrow();
    });

    it('only warns on localhost', async () => {
      process.env.DEPLOY_ENVIRONMENT = 'localhost';

      const { assertPlanPricesConfigured } = await import('../server/config/planPrices.js');

      expect(() => assertPlanPricesConfigured()).not.toThrow();
    });
  });

  it('exposes the supported plans and billing cycles used by the checkout validator', async () => {
    process.env.STRIPE_PRICE_ID = 'price_fallback';

    const { SUPPORTED_PLANS, SUPPORTED_BILLING_CYCLES } = await import('../server/config/planPrices.js');

    expect(SUPPORTED_PLANS).toEqual(['basic', 'pro']);
    expect(SUPPORTED_BILLING_CYCLES).toEqual(['monthly', 'yearly']);
  });
});
