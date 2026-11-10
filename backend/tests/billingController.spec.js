import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/integrations/stripe/customerPortalSession.js', () => ({
  createStripeCustomerPortalSession: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/stripe/customerId.js', () => ({
  createCompanyIdInStripe: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/stripe/checkoutSession.js', () => ({
  createStripeCheckoutSession: jest.fn(),
  reuseOrExpireOpenStripeCheckoutSessions: jest.fn(),
  //* The real predicate - it only inspects the error shape
  isStripeCheckoutConflictError: (error) => error?.type === 'StripeIdempotencyError' || error?.statusCode === 409,
}));

jest.unstable_mockModule('../server/integrations/stripe/subscription.js', () => ({
  hasActiveStripeSubscription: jest.fn(),
}));

jest.unstable_mockModule('../server/models/subscriptionModel.js', () => ({
  getCompanyStripeIdInDb: jest.fn(),
  getSubscriptionDataInDb: jest.fn(),
  getSubscriptionPublicDataInDb: jest.fn(),
  storeBillingCompanyIdInDb: jest.fn(),
}));

const {
  createCompanyBillingId,
  getBillingCheckoutSessionUrl,
  getBillingCustomerPortalUrl,
} = await import('../server/controllers/billingController.js');
const { createStripeCustomerPortalSession } = await import('../server/integrations/stripe/customerPortalSession.js');
const { createCompanyIdInStripe } = await import('../server/integrations/stripe/customerId.js');
const { createStripeCheckoutSession, reuseOrExpireOpenStripeCheckoutSessions } = await import('../server/integrations/stripe/checkoutSession.js');
const { hasActiveStripeSubscription } = await import('../server/integrations/stripe/subscription.js');
const {
  getCompanyStripeIdInDb,
  getSubscriptionDataInDb,
  storeBillingCompanyIdInDb,
} = await import('../server/models/subscriptionModel.js');

const FUTURE = new Date('2030-01-01T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createReq = () => ({
  user: { id: 'user-1', email: 'owner@acme.test', company_id: 'company-1' },
  body: { planName: 'pro', planBillingCycle: 'monthly' },
});

describe('billingController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    createStripeCheckoutSession.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });
    createCompanyIdInStripe.mockResolvedValue({ id: 'cus_new' });
    storeBillingCompanyIdInDb.mockImplementation(async (companyId, stripeId) => stripeId);
    hasActiveStripeSubscription.mockResolvedValue(false);
    reuseOrExpireOpenStripeCheckoutSessions.mockResolvedValue(null);
  });

  describe('getBillingCheckoutSessionUrl', () => {
    it('refuses with 409 SUBSCRIPTION_ACTIVE while a Stripe subscription is active', async () => {
      getSubscriptionDataInDb.mockResolvedValue({ stripe_subscription_id: 'sub_123', expires_at: FUTURE });
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SUBSCRIPTION_ACTIVE' }));
      expect(hasActiveStripeSubscription).not.toHaveBeenCalled();
      expect(createStripeCheckoutSession).not.toHaveBeenCalled();
    });

    it('refuses with 409 SUBSCRIPTION_ACTIVE when Stripe reports an active subscription the row does not know yet', async () => {
      getSubscriptionDataInDb.mockResolvedValue({ stripe_subscription_id: null, expires_at: FUTURE });
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      hasActiveStripeSubscription.mockResolvedValue(true);
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(hasActiveStripeSubscription).toHaveBeenCalledWith('cus_existing');
      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SUBSCRIPTION_ACTIVE' }));
      expect(reuseOrExpireOpenStripeCheckoutSessions).not.toHaveBeenCalled();
      expect(createStripeCheckoutSession).not.toHaveBeenCalled();
    });

    it('reuses an open session for the same plan instead of creating a new one', async () => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      reuseOrExpireOpenStripeCheckoutSessions.mockResolvedValue({ id: 'cs_open', url: 'https://checkout.stripe.test/open' });
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(reuseOrExpireOpenStripeCheckoutSessions).toHaveBeenCalledWith('cus_existing', 'pro', 'monthly');
      expect(createStripeCheckoutSession).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ checkoutSessionUrl: 'https://checkout.stripe.test/open' });
    });

    it('creates a new session after the other open sessions of an existing customer were expired', async () => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(reuseOrExpireOpenStripeCheckoutSessions).toHaveBeenCalledWith('cus_existing', 'pro', 'monthly');
      expect(reuseOrExpireOpenStripeCheckoutSessions.mock.invocationCallOrder[0])
        .toBeLessThan(createStripeCheckoutSession.mock.invocationCallOrder[0]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ checkoutSessionUrl: 'https://checkout.stripe.test/s' });
    });

    it.each([
      ['an idempotency error', { type: 'StripeIdempotencyError', statusCode: 400 }],
      ['a 409 request-in-progress error', { type: 'StripeInvalidRequestError', statusCode: 409 }],
    ])('maps %s from Stripe to 409 CHECKOUT_IN_PROGRESS', async (label, stripeError) => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      createStripeCheckoutSession.mockRejectedValue(Object.assign(new Error('conflict'), stripeError));
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'CHECKOUT_IN_PROGRESS' }));
    });

    it('rethrows other Stripe errors', async () => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      createStripeCheckoutSession.mockRejectedValue(Object.assign(new Error('stripe down'), { statusCode: 500 }));
      const res = createMockRes();

      await expect(getBillingCheckoutSessionUrl(createReq(), res)).rejects.toThrow('stripe down');
    });

    it('allows checkout during a trial (non-sub_ id)', async () => {
      getSubscriptionDataInDb.mockResolvedValue({ stripe_subscription_id: null, expires_at: FUTURE });
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(createStripeCheckoutSession).toHaveBeenCalledWith('company-1', 'cus_existing', 'user-1', 'pro', 'monthly');
      expect(createCompanyIdInStripe).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('allows checkout after the Stripe subscription ended', async () => {
      getSubscriptionDataInDb.mockResolvedValue({ stripe_subscription_id: 'sub_old', expires_at: PAST });
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('works without a subscription row and creates the Stripe customer', async () => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue(null);
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(createCompanyIdInStripe).toHaveBeenCalledWith('owner@acme.test', 'company-1');
      expect(storeBillingCompanyIdInDb).toHaveBeenCalledWith('company-1', 'cus_new');
      //* A brand-new customer cannot have subscriptions or open sessions yet
      expect(hasActiveStripeSubscription).not.toHaveBeenCalled();
      expect(reuseOrExpireOpenStripeCheckoutSessions).not.toHaveBeenCalled();
      expect(createStripeCheckoutSession).toHaveBeenCalledWith('company-1', 'cus_new', 'user-1', 'pro', 'monthly');
      expect(res.json).toHaveBeenCalledWith({ checkoutSessionUrl: 'https://checkout.stripe.test/s' });
    });

    it('reuses the stored customer id when a concurrent request won the race', async () => {
      getSubscriptionDataInDb.mockResolvedValue(null);
      getCompanyStripeIdInDb.mockResolvedValue(null);
      storeBillingCompanyIdInDb.mockResolvedValue('cus_winner');
      const res = createMockRes();

      await getBillingCheckoutSessionUrl(createReq(), res);

      expect(createStripeCheckoutSession).toHaveBeenCalledWith('company-1', 'cus_winner', 'user-1', 'pro', 'monthly');
    });
  });

  describe('getBillingCustomerPortalUrl', () => {
    it('returns the portal url when the company has a Stripe customer', async () => {
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      createStripeCustomerPortalSession.mockResolvedValue({ url: 'https://portal.stripe.test/p' });
      const res = createMockRes();

      await getBillingCustomerPortalUrl(createReq(), res);

      expect(createStripeCustomerPortalSession).toHaveBeenCalledWith('cus_existing');
      expect(res.json).toHaveBeenCalledWith({ customerPortalUrl: 'https://portal.stripe.test/p' });
    });

    it('returns 409 when the company has no Stripe customer yet', async () => {
      getCompanyStripeIdInDb.mockResolvedValue(null);
      const res = createMockRes();

      await getBillingCustomerPortalUrl(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createStripeCustomerPortalSession).not.toHaveBeenCalled();
    });
  });

  describe('createCompanyBillingId', () => {
    it('returns 409 when the company already has a billing id', async () => {
      getCompanyStripeIdInDb.mockResolvedValue('cus_existing');
      const res = createMockRes();

      await createCompanyBillingId(createReq(), res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(createCompanyIdInStripe).not.toHaveBeenCalled();
    });

    it('creates and stores the Stripe customer', async () => {
      getCompanyStripeIdInDb.mockResolvedValue(null);
      const res = createMockRes();

      await createCompanyBillingId(createReq(), res);

      expect(storeBillingCompanyIdInDb).toHaveBeenCalledWith('company-1', 'cus_new');
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
