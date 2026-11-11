import { jest } from '@jest/globals';

//* Redirect URLs are built from it (utils/frontendUrl.js)
process.env.FRONT_WEB_APP_ORIGIN_URL ??= 'https://app.example.com';

jest.unstable_mockModule('../server/config/stripe.js', () => ({
  stripeInstance: {
    checkout: {
      sessions: {
        create: jest.fn(),
        list: jest.fn(),
        expire: jest.fn(),
      },
    },
    customers: {
      create: jest.fn(),
    },
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
    subscriptions: {
      list: jest.fn(),
      update: jest.fn(),
      retrieve: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../server/config/planPrices.js', () => ({
  getStripePriceId: jest.fn(() => 'price_pro_monthly'),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
}));

const { stripeInstance } = await import('../server/config/stripe.js');
const {
  createStripeCheckoutSession,
  isStripeCheckoutConflictError,
  reuseOrExpireOpenStripeCheckoutSessions,
} = await import('../server/integrations/stripe/checkoutSession.js');
const { createCompanyIdInStripe } = await import('../server/integrations/stripe/customerId.js');
const { createStripeCustomerPortalSession } = await import('../server/integrations/stripe/customerPortalSession.js');
const {
  cancelCompanyBillingInStripe,
  hasActiveStripeSubscription,
} = await import('../server/integrations/stripe/subscription.js');
const { logError } = await import('../server/config/loggerFunctions.js');

const checkoutKey = () => stripeInstance.checkout.sessions.create.mock.calls.at(-1)[1].idempotencyKey;
const customerKey = () => stripeInstance.customers.create.mock.calls.at(-1)[1].idempotencyKey;

describe('createStripeCheckoutSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripeInstance.checkout.sessions.create.mockResolvedValue({ url: 'https://checkout.stripe.test/s' });
  });

  it('uses a fresh idempotency key per request so a key is never replayed across requests', async () => {
    await createStripeCheckoutSession('company-1', 'cus_1', 'user-1', 'pro', 'monthly');
    const firstKey = checkoutKey();
    await createStripeCheckoutSession('company-1', 'cus_1', 'user-2', 'pro', 'monthly');

    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(checkoutKey()).not.toBe(firstKey);
  });

  //* A trailing slash or a path in FRONT_WEB_APP_ORIGIN_URL never yields
  //* `//user/billing` - only its origin is used
  it('builds the success and cancel URLs from the front-end origin only', async () => {
    const previous = process.env.FRONT_WEB_APP_ORIGIN_URL;
    process.env.FRONT_WEB_APP_ORIGIN_URL = 'https://app.example.com/';

    try {
      await createStripeCheckoutSession('company-1', 'cus_1', 'user-1', 'pro', 'monthly');
    } finally {
      process.env.FRONT_WEB_APP_ORIGIN_URL = previous;
    }

    const [params] = stripeInstance.checkout.sessions.create.mock.calls[0];
    expect(params.success_url).toBe('https://app.example.com/user/billing?status=paid');
    expect(params.cancel_url).toBe('https://app.example.com/user/billing?status=cancelled');
  });

  it('stores the plan, cycle and price id in the session metadata for later reuse', async () => {
    await createStripeCheckoutSession('company-1', 'cus_1', 'user-1', 'pro', 'monthly');

    const [params] = stripeInstance.checkout.sessions.create.mock.calls[0];
    expect(params.metadata).toEqual(expect.objectContaining({
      planName: 'pro',
      planBillingCycle: 'monthly',
      priceId: 'price_pro_monthly',
      companyId: 'company-1',
    }));
  });
});

describe('reuseOrExpireOpenStripeCheckoutSessions', () => {
  const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

  const openSession = (id, metadata, overrides = {}) => ({
    id,
    url: `https://checkout.stripe.test/${id}`,
    expires_at: inOneHour(),
    metadata,
    ...overrides,
  });

  const proMonthly = { planName: 'pro', planBillingCycle: 'monthly', priceId: 'price_pro_monthly' };

  beforeEach(() => {
    jest.clearAllMocks();
    stripeInstance.checkout.sessions.expire.mockResolvedValue({});
  });

  it('reuses the open session for the same plan, cycle and price and expires every other one', async () => {
    stripeInstance.checkout.sessions.list.mockResolvedValue({
      data: [
        openSession('cs_yearly', { ...proMonthly, planBillingCycle: 'yearly' }),
        openSession('cs_match', proMonthly),
      ],
    });

    const reused = await reuseOrExpireOpenStripeCheckoutSessions('cus_1', 'pro', 'monthly');

    expect(stripeInstance.checkout.sessions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'open', limit: 100 });
    expect(reused.id).toBe('cs_match');
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledTimes(1);
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_yearly');
  });

  it('expires every open session and resolves to null when none matches', async () => {
    stripeInstance.checkout.sessions.list.mockResolvedValue({
      data: [
        openSession('cs_old_price', { ...proMonthly, priceId: 'price_old' }),
        openSession('cs_legacy', { planName: 'pro', planBillingCycle: 'monthly' }),
      ],
    });

    await expect(reuseOrExpireOpenStripeCheckoutSessions('cus_1', 'pro', 'monthly')).resolves.toBeNull();
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_old_price');
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_legacy');
  });

  it('does not reuse a matching session that is about to expire', async () => {
    stripeInstance.checkout.sessions.list.mockResolvedValue({
      data: [openSession('cs_expiring', proMonthly, { expires_at: Math.floor(Date.now() / 1000) + 60 })],
    });

    await expect(reuseOrExpireOpenStripeCheckoutSessions('cus_1', 'pro', 'monthly')).resolves.toBeNull();
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_expiring');
  });

  it('does nothing when there is no open session', async () => {
    stripeInstance.checkout.sessions.list.mockResolvedValue({ data: [] });

    await expect(reuseOrExpireOpenStripeCheckoutSessions('cus_1', 'pro', 'monthly')).resolves.toBeNull();
    expect(stripeInstance.checkout.sessions.expire).not.toHaveBeenCalled();
  });
});

describe('isStripeCheckoutConflictError', () => {
  it('recognizes idempotency errors and 409 request-in-progress errors', () => {
    expect(isStripeCheckoutConflictError({ type: 'StripeIdempotencyError', statusCode: 400 })).toBe(true);
    expect(isStripeCheckoutConflictError({ type: 'StripeInvalidRequestError', statusCode: 409 })).toBe(true);
  });

  it('leaves every other error alone', () => {
    expect(isStripeCheckoutConflictError({ type: 'StripeAPIError', statusCode: 500 })).toBe(false);
    expect(isStripeCheckoutConflictError(new Error('boom'))).toBe(false);
    expect(isStripeCheckoutConflictError(undefined)).toBe(false);
  });
});

describe('createCompanyIdInStripe', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    stripeInstance.customers.create.mockResolvedValue({ id: 'cus_new' });
  });

  it('keeps the same idempotency key for the same company and email', async () => {
    await createCompanyIdInStripe('owner@acme.test', 'company-1');
    const firstKey = customerKey();
    await createCompanyIdInStripe('owner@acme.test', 'company-1');

    expect(customerKey()).toBe(firstKey);
    expect(firstKey).toContain('company-1');
    expect(firstKey).not.toContain('owner@acme.test');
  });

  it('changes the idempotency key when the email changes', async () => {
    await createCompanyIdInStripe('owner@acme.test', 'company-1');
    const firstKey = customerKey();
    await createCompanyIdInStripe('other@acme.test', 'company-1');

    expect(customerKey()).not.toBe(firstKey);
  });
});

describe('hasActiveStripeSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists every subscription of the customer, not only active ones', async () => {
    stripeInstance.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_1', status: 'active' }] });

    await expect(hasActiveStripeSubscription('cus_1')).resolves.toBe(true);
    expect(stripeInstance.subscriptions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'all', limit: 10 });
  });

  it.each(['trialing', 'past_due'])('counts a %s subscription as subscribed', async (status) => {
    stripeInstance.subscriptions.list.mockResolvedValue({ data: [{ id: 'sub_1', status: 'canceled' }, { id: 'sub_2', status }] });

    await expect(hasActiveStripeSubscription('cus_1')).resolves.toBe(true);
  });

  it('is false when no subscription is in an access-granting status', async () => {
    stripeInstance.subscriptions.list.mockResolvedValue({
      data: [{ id: 'sub_1', status: 'canceled' }, { id: 'sub_2', status: 'incomplete_expired' }, { id: 'sub_3', status: 'unpaid' }],
    });

    await expect(hasActiveStripeSubscription('cus_1')).resolves.toBe(false);
  });

  it('is false when the customer has no subscription', async () => {
    stripeInstance.subscriptions.list.mockResolvedValue({ data: [] });

    await expect(hasActiveStripeSubscription('cus_1')).resolves.toBe(false);
  });
});

describe('cancelCompanyBillingInStripe', () => {
  const deletedCompany = {
    companyId: 'company-1',
    stripeCustomerId: 'cus_1',
    stripeSubscriptionId: 'sub_stored',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    stripeInstance.checkout.sessions.list.mockResolvedValue({ data: [{ id: 'cs_open_1' }, { id: 'cs_open_2' }] });
    stripeInstance.checkout.sessions.expire.mockResolvedValue({});
    stripeInstance.subscriptions.list.mockResolvedValue({
      data: [
        { id: 'sub_stored', status: 'active', cancel_at_period_end: false },
        //* Completed in another tab - the deleted row never tracked it
        { id: 'sub_other_tab', status: 'trialing', cancel_at_period_end: false },
        { id: 'sub_ended', status: 'canceled', cancel_at_period_end: false },
        { id: 'sub_already_cancelling', status: 'active', cancel_at_period_end: true },
      ],
    });
    stripeInstance.subscriptions.update.mockResolvedValue({});
  });

  it('expires every open checkout before listing the subscriptions', async () => {
    await cancelCompanyBillingInStripe(deletedCompany);

    expect(stripeInstance.checkout.sessions.list).toHaveBeenCalledWith({ customer: 'cus_1', status: 'open', limit: 100 });
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_open_1');
    expect(stripeInstance.checkout.sessions.expire).toHaveBeenCalledWith('cs_open_2');
    expect(Math.max(...stripeInstance.checkout.sessions.expire.mock.invocationCallOrder))
      .toBeLessThan(stripeInstance.subscriptions.list.mock.invocationCallOrder[0]);
  });

  it('cancels every access-granting subscription of the customer at period end', async () => {
    await cancelCompanyBillingInStripe(deletedCompany);

    expect(stripeInstance.subscriptions.update.mock.calls).toEqual([
      ['sub_stored', { cancel_at_period_end: true }],
      ['sub_other_tab', { cancel_at_period_end: true }],
    ]);
    expect(logError).not.toHaveBeenCalled();
  });

  it('falls back to the stored subscription when the customer cannot be listed', async () => {
    stripeInstance.subscriptions.list.mockRejectedValue(new Error('stripe down'));

    await cancelCompanyBillingInStripe(deletedCompany);

    expect(stripeInstance.subscriptions.update).toHaveBeenCalledWith('sub_stored', { cancel_at_period_end: true });
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('list customer subscriptions'),
      expect.any(Error),
      expect.objectContaining(deletedCompany),
    );
  });

  it('logs each failed step with the ids needed to retry and never throws', async () => {
    stripeInstance.checkout.sessions.expire.mockRejectedValueOnce(new Error('expire failed'));
    stripeInstance.subscriptions.update.mockRejectedValueOnce(new Error('update failed'));

    await expect(cancelCompanyBillingInStripe(deletedCompany)).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('expire checkout session'),
      expect.any(Error),
      expect.objectContaining({ ...deletedCompany, checkoutSessionId: 'cs_open_1' }),
    );
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('cancel subscription'),
      expect.any(Error),
      expect.objectContaining({ ...deletedCompany, cancelSubscriptionId: 'sub_stored' }),
    );
  });

  it('does nothing for a company that never reached Stripe', async () => {
    await cancelCompanyBillingInStripe({ companyId: 'company-1' });

    expect(stripeInstance.checkout.sessions.list).not.toHaveBeenCalled();
    expect(stripeInstance.subscriptions.update).not.toHaveBeenCalled();
  });
});

describe('createStripeCustomerPortalSession', () => {
  it('returns to the billing page on the front-end origin only', async () => {
    const previous = process.env.FRONT_WEB_APP_ORIGIN_URL;
    process.env.FRONT_WEB_APP_ORIGIN_URL = 'https://app.example.com/base/';
    stripeInstance.billingPortal.sessions.create.mockResolvedValue({ url: 'https://billing.stripe.test/p' });

    try {
      await createStripeCustomerPortalSession('cus_1');
    } finally {
      process.env.FRONT_WEB_APP_ORIGIN_URL = previous;
    }

    expect(stripeInstance.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: 'cus_1',
      return_url: 'https://app.example.com/user/billing',
    });
  });
});
