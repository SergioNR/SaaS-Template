import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/config/stripe.js', () => ({
  stripeInstance: {
    webhooks: {
      constructEvent: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../server/integrations/stripe/subscription.js', () => ({
  retrieveStripeSubscription: jest.fn(),
}));

jest.unstable_mockModule('../server/models/subscriptionModel.js', () => ({
  getCompanyIdByStripeCustomerIdInDb: jest.fn(),
  syncSubscriptionWithCompanyLockInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));

//* Business events are covered by their own specs - stubbed here so the
//* real models behind them never load
jest.unstable_mockModule('../server/utils/businessEvents.js', () => ({
  notifyCompanyRegistered: jest.fn().mockResolvedValue(undefined),
  notifyInviteAccepted: jest.fn().mockResolvedValue(undefined),
  notifySubscriptionTransition: jest.fn().mockResolvedValue(undefined),
  notifyUserDeleted: jest.fn().mockResolvedValue(undefined),
}));

const { stripeEventHandler, classifySubscriptionTransition } = await import('../server/webhooks/stripe/stripeEventHandler.js');
const { notifySubscriptionTransition } = await import('../server/utils/businessEvents.js');
const { stripeInstance } = await import('../server/config/stripe.js');
const { retrieveStripeSubscription } = await import('../server/integrations/stripe/subscription.js');
const {
  getCompanyIdByStripeCustomerIdInDb,
  syncSubscriptionWithCompanyLockInDb,
} = await import('../server/models/subscriptionModel.js');
const { logError, logInfo, logWarn } = await import('../server/config/loggerFunctions.js');

const PERIOD_END = 1893456000; //* 2030-01-01T00:00:00Z
const FUTURE = new Date('2030-01-01T00:00:00Z');
const PAST = new Date('2020-01-01T00:00:00Z');

//* Simulates the locked transaction: hands the stored row to the resolver and
//* records the write it returns, exactly like the model does
const upsertCalls = [];
let storedSubscription = null;

const givenStoredSubscription = (value) => {
  storedSubscription = value;
};

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createReq = () => ({
  headers: { 'stripe-signature': 'sig' },
  body: Buffer.from('{}'),
  ip: '1.2.3.4',
});

const givenEvent = (type, object) => {
  stripeInstance.webhooks.constructEvent.mockReturnValue({
    id: 'evt_1',
    type,
    data: { object },
  });
};

const stripeSubscription = (overrides = {}) => ({
  id: 'sub_new',
  customer: 'cus_1',
  status: 'active',
  ended_at: null,
  items: { data: [{ current_period_end: PERIOD_END }] },
  ...overrides,
});

const givenEventWithPreviousAttributes = (type, object, previousAttributes) => {
  stripeInstance.webhooks.constructEvent.mockReturnValue({
    id: 'evt_1',
    type,
    data: { object, previous_attributes: previousAttributes },
  });
};

const run = async () => {
  const res = createMockRes();
  await stripeEventHandler(createReq(), res);
  return res;
};

describe('stripeEventHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    upsertCalls.length = 0;
    givenStoredSubscription(null);
    getCompanyIdByStripeCustomerIdInDb.mockResolvedValue('company-1');
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription());
    syncSubscriptionWithCompanyLockInDb.mockImplementation(async (companyId, resolveSubscriptionWrite) => {
      const write = resolveSubscriptionWrite(storedSubscription);

      if (!write) {
        return null;
      }

      upsertCalls.push({ companyId, ...write });
      return { previous: storedSubscription, written: write };
    });
  });

  it('returns a generic 400 on a bad signature, logged as a warning (no alert)', async () => {
    stripeInstance.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature for payload');
    });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.json.mock.calls[0][0];
    expect(body.message).not.toMatch(/signatures found/);
    expect(logWarn).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
  });

  it.each(['paid', 'no_payment_required'])('stores the retrieved subscription and its item period end on checkout.session.completed (%s)', async (paymentStatus) => {
    givenStoredSubscription({ stripe_subscription_id: null, expires_at: FUTURE });
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: paymentStatus,
      subscription: 'sub_new',
      customer: 'cus_1',
      client_reference_id: 'company-1',
    });

    const res = await run();

    expect(retrieveStripeSubscription).toHaveBeenCalledWith('sub_new');
    //* Resolved from the customer this API linked, never from client_reference_id
    expect(getCompanyIdByStripeCustomerIdInDb).toHaveBeenCalledWith('cus_1');
    expect(syncSubscriptionWithCompanyLockInDb).toHaveBeenCalledWith('company-1', expect.any(Function));
    expect(upsertCalls).toEqual([{
      companyId: 'company-1',
      stripeSubscriptionId: 'sub_new',
      status: 'active',
      expiresAt: new Date(PERIOD_END * 1000),
      syncedAt: expect.any(Date),
    }]);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reads Stripe once, before taking the company lock', async () => {
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(retrieveStripeSubscription).toHaveBeenCalledTimes(1);
    expect(retrieveStripeSubscription.mock.invocationCallOrder[0])
      .toBeLessThan(syncSubscriptionWithCompanyLockInDb.mock.invocationCallOrder[0]);
  });

  it('stamps the write with a syncedAt taken before the Stripe read', async () => {
    let readStartedAt;
    retrieveStripeSubscription.mockImplementation(async () => {
      readStartedAt = Date.now();
      return stripeSubscription();
    });
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(upsertCalls[0].syncedAt.getTime()).toBeLessThanOrEqual(readStartedAt);
  });

  it('syncs customer.subscription.created (subscriptions created outside Checkout)', async () => {
    givenEvent('customer.subscription.created', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(upsertCalls).toEqual([expect.objectContaining({ companyId: 'company-1', stripeSubscriptionId: 'sub_new' })]);
  });

  it('refuses a checkout whose client_reference_id disagrees with the customer mapping', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: 'paid',
      subscription: 'sub_new',
      customer: 'cus_1',
      client_reference_id: 'company-other',
    });

    const res = await run();

    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('company-other'), expect.any(Error), 'checkout.session.completed');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refuses a checkout whose customer does not own the subscription', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: 'paid',
      subscription: 'sub_new',
      customer: 'cus_other',
      client_reference_id: 'company-1',
    });

    await run();

    expect(getCompanyIdByStripeCustomerIdInDb).not.toHaveBeenCalled();
    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalled();
  });

  it('skips checkout.session.completed while the payment is still unpaid (async methods)', async () => {
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: 'unpaid',
      subscription: 'sub_new',
      client_reference_id: 'company-1',
    });

    const res = await run();

    expect(retrieveStripeSubscription).not.toHaveBeenCalled();
    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('stores the subscription on checkout.session.async_payment_succeeded', async () => {
    givenEvent('checkout.session.async_payment_succeeded', {
      id: 'cs_1',
      payment_status: 'paid',
      subscription: 'sub_new',
      customer: 'cus_1',
      client_reference_id: 'company-1',
    });

    await run();

    expect(upsertCalls[0]).toEqual(expect.objectContaining({ stripeSubscriptionId: 'sub_new' }));
  });

  it('falls back to the top-level current_period_end for older API versions', async () => {
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({
      items: { data: [] },
      current_period_end: PERIOD_END,
    }));
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(upsertCalls[0]).toEqual(expect.objectContaining({ expiresAt: new Date(PERIOD_END * 1000) }));
  });

  it('renews expires_at on invoice.paid using the invoice parent subscription and customer', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_new', expires_at: PAST });
    givenEvent('invoice.paid', {
      id: 'in_1',
      customer: 'cus_1',
      parent: { subscription_details: { subscription: 'sub_new' } },
    });

    await run();

    expect(getCompanyIdByStripeCustomerIdInDb).toHaveBeenCalledWith('cus_1');
    expect(upsertCalls).toEqual([{
      companyId: 'company-1',
      stripeSubscriptionId: 'sub_new',
      status: 'active',
      expiresAt: new Date(PERIOD_END * 1000),
      syncedAt: expect.any(Date),
    }]);
  });

  it('resolves the company from the fetched subscription customer, not the payload', async () => {
    givenEvent('customer.subscription.updated', { id: 'sub_new' });

    await run();

    expect(retrieveStripeSubscription).toHaveBeenCalledTimes(1);
    expect(getCompanyIdByStripeCustomerIdInDb).toHaveBeenCalledWith('cus_1');
    expect(upsertCalls).toHaveLength(1);
  });

  it('ignores invoices that do not belong to a subscription', async () => {
    givenEvent('invoice.paid', { id: 'in_1', parent: null });

    const res = await run();

    expect(retrieveStripeSubscription).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('keeps the row and expires it on customer.subscription.deleted', async () => {
    const endedAt = 1700000000;
    givenStoredSubscription({ stripe_subscription_id: 'sub_new', expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ status: 'canceled', ended_at: endedAt }));
    givenEvent('customer.subscription.deleted', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(upsertCalls).toEqual([{
      companyId: 'company-1',
      stripeSubscriptionId: 'sub_new',
      status: 'canceled',
      expiresAt: new Date(endedAt * 1000),
      syncedAt: expect.any(Date),
    }]);
  });

  it('expires the subscription immediately when it becomes unpaid', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_new', expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ status: 'unpaid' }));
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    const before = Date.now();
    await run();

    const { expiresAt } = upsertCalls[0];
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('alerts (logError) with redacted ids when a second active subscription shows up for a company', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_current_1234', expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ id: 'sub_other_5678', status: 'active' }));
    givenEvent('customer.subscription.updated', { id: 'sub_other_5678', customer: 'cus_1' });

    const res = await run();

    expect(upsertCalls).toHaveLength(0);
    expect(logInfo).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
    const [message] = logError.mock.calls[0];
    expect(message).toContain('sub_...1234');
    expect(message).toContain('sub_...5678');
    expect(message).not.toContain('sub_current_1234');
    expect(message).not.toContain('sub_other_5678');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('does not let a canceled old subscription overwrite a trial row (info only)', async () => {
    givenStoredSubscription({ stripe_subscription_id: null, expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ id: 'sub_old', status: 'canceled', ended_at: 1700000000 }));
    givenEvent('customer.subscription.deleted', { id: 'sub_old', customer: 'cus_1' });

    await run();

    expect(upsertCalls).toHaveLength(0);
    expect(logError).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalled();
  });

  it('waits for payment events on an incomplete subscription', async () => {
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ status: 'incomplete' }));
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    await run();

    expect(upsertCalls).toHaveLength(0);
    expect(logError).not.toHaveBeenCalled();
  });

  it('lets a resubscription replace an ended stored subscription', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_old', expires_at: PAST });
    givenEvent('checkout.session.completed', {
      id: 'cs_2',
      payment_status: 'paid',
      subscription: 'sub_new',
      customer: 'cus_1',
      client_reference_id: 'company-1',
    });

    await run();

    expect(upsertCalls[0]).toEqual(expect.objectContaining({ stripeSubscriptionId: 'sub_new' }));
  });

  it('acknowledges an ended subscription of an unknown customer with a warning only', async () => {
    getCompanyIdByStripeCustomerIdInDb.mockResolvedValue(null);
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ status: 'canceled', ended_at: 1700000000 }));
    givenEvent('customer.subscription.deleted', { id: 'sub_new', customer: 'cus_unknown' });

    const res = await run();

    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('pages (logError with full ids) on an access-granting subscription without a company', async () => {
    getCompanyIdByStripeCustomerIdInDb.mockResolvedValue(null);
    givenEvent('customer.subscription.created', { id: 'sub_new', customer: 'cus_1' });

    const res = await run();

    expect(syncSubscriptionWithCompanyLockInDb).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('no matching company'),
      expect.any(Error),
      expect.objectContaining({ stripeSubscriptionId: 'sub_new', stripeCustomerId: 'cus_1' }),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it.each(['P2003', 'P2025'])('returns 200 with a warning when the company was deleted (%s)', async (code) => {
    syncSubscriptionWithCompanyLockInDb.mockRejectedValue(Object.assign(new Error('prisma'), { code }));
    givenEvent('checkout.session.completed', {
      id: 'cs_1',
      payment_status: 'paid',
      subscription: 'sub_new',
      customer: 'cus_1',
      client_reference_id: 'company-1',
    });

    const res = await run();

    expect(logWarn).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('acknowledges events whose Stripe subscription no longer exists', async () => {
    retrieveStripeSubscription.mockRejectedValue(Object.assign(new Error('No such subscription'), {
      type: 'StripeInvalidRequestError',
      code: 'resource_missing',
    }));
    givenEvent('customer.subscription.updated', { id: 'sub_gone', customer: 'cus_1' });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('returns 500 on other DB failures so Stripe retries', async () => {
    syncSubscriptionWithCompanyLockInDb.mockRejectedValue(new Error('connection lost'));
    givenEvent('customer.subscription.updated', { id: 'sub_new', customer: 'cus_1' });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('stripeEventHandler business events', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    givenStoredSubscription(null);
    getCompanyIdByStripeCustomerIdInDb.mockResolvedValue('company-1');
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription());
    syncSubscriptionWithCompanyLockInDb.mockImplementation(async (companyId, resolveSubscriptionWrite) => {
      const write = resolveSubscriptionWrite(storedSubscription);

      return write ? { previous: storedSubscription, written: write } : null;
    });
  });

  it('emits subscription.started (converted) when a trial company pays for the first time', async () => {
    givenStoredSubscription({ stripe_subscription_id: null, stripe_status: null, expires_at: FUTURE });
    givenEvent('invoice.paid', { subscription: 'sub_new' });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(notifySubscriptionTransition).toHaveBeenCalledWith('company-1', expect.objectContaining({
      event: 'subscription.started',
      fields: expect.objectContaining({ startKind: 'converted' }),
    }));
  });

  it('emits nothing for a renewal of the same active subscription', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_new', stripe_status: 'active', expires_at: FUTURE });
    givenEvent('invoice.paid', { subscription: 'sub_new' });

    await run();

    expect(notifySubscriptionTransition).not.toHaveBeenCalled();
  });

  it('emits subscription.cancellation_scheduled from previous_attributes confirmed by the fresh read', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_new', stripe_status: 'active', expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ cancel_at_period_end: true }));
    givenEventWithPreviousAttributes('customer.subscription.updated', { id: 'sub_new' }, { cancel_at_period_end: false });

    await run();

    expect(notifySubscriptionTransition).toHaveBeenCalledWith('company-1', expect.objectContaining({
      event: 'subscription.cancellation_scheduled',
    }));
  });

  it('emits nothing for a skipped write and still acknowledges', async () => {
    givenStoredSubscription({ stripe_subscription_id: 'sub_old', stripe_status: 'active', expires_at: FUTURE });
    retrieveStripeSubscription.mockResolvedValue(stripeSubscription({ status: 'canceled', ended_at: 1 }));
    givenEvent('customer.subscription.deleted', { id: 'sub_new' });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(notifySubscriptionTransition).not.toHaveBeenCalled();
  });

  it('acknowledges the webhook while the business event send hangs', async () => {
    givenStoredSubscription({ stripe_subscription_id: null, stripe_status: null, expires_at: FUTURE });
    notifySubscriptionTransition.mockReturnValueOnce(new Promise(() => {}));
    givenEvent('invoice.paid', { subscription: 'sub_new' });

    const res = await run();

    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('classifySubscriptionTransition', () => {
  const written = (overrides = {}) => ({
    stripeSubscriptionId: 'sub_1',
    status: 'active',
    expiresAt: FUTURE,
    syncedAt: new Date(),
    ...overrides,
  });

  it('trial -> active is a converted start', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: null, stripe_status: null, expires_at: FUTURE },
      written(),
      { eventType: 'checkout.session.completed', subscription: stripeSubscription({ id: 'sub_1' }) },
    )).toEqual({
      event: 'subscription.started',
      fields: { startKind: 'converted', plan: null, periodEndsAt: FUTURE },
    });
  });

  it('a company without any row starts as converted', () => {
    expect(classifySubscriptionTransition(null, written(), {}).fields.startKind).toBe('converted');
  });

  it('ended -> active is a resubscription', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_old', stripe_status: 'canceled', expires_at: PAST },
      written(),
      {},
    )).toEqual(expect.objectContaining({ event: 'subscription.started', fields: expect.objectContaining({ startKind: 'resubscribed' }) }));
  });

  it('active -> canceled is an end with the final status', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_1', stripe_status: 'active', expires_at: FUTURE },
      written({ status: 'canceled', expiresAt: PAST }),
      { eventType: 'customer.subscription.deleted' },
    )).toEqual({ event: 'subscription.ended', fields: { plan: null, status: 'canceled' } });
  });

  it('a legacy row without stored status counts as granting while it has not expired', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_1', stripe_status: null, expires_at: FUTURE },
      written(),
      { eventType: 'invoice.paid' },
    )).toBeNull();
  });

  it('cancel_at_period_end false -> true schedules a cancellation ending at the period end', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_1', stripe_status: 'active', expires_at: FUTURE },
      written(),
      {
        eventType: 'customer.subscription.updated',
        previousAttributes: { cancel_at_period_end: false },
        subscription: stripeSubscription({ id: 'sub_1', cancel_at_period_end: true }),
      },
    )).toEqual({
      event: 'subscription.cancellation_scheduled',
      fields: { plan: null, accessEndsAt: FUTURE },
    });
  });

  it('cancel_at null -> set uses cancel_at as the access end', () => {
    const transition = classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_1', stripe_status: 'active', expires_at: FUTURE },
      written(),
      {
        eventType: 'customer.subscription.updated',
        previousAttributes: { cancel_at: null },
        subscription: stripeSubscription({ id: 'sub_1', cancel_at: PERIOD_END }),
      },
    );

    expect(transition.fields.accessEndsAt).toEqual(new Date(PERIOD_END * 1000));
  });

  it('a stale previous_attributes not confirmed by the fresh read emits nothing', () => {
    expect(classifySubscriptionTransition(
      { stripe_subscription_id: 'sub_1', stripe_status: 'active', expires_at: FUTURE },
      written(),
      {
        eventType: 'customer.subscription.updated',
        previousAttributes: { cancel_at_period_end: false },
        subscription: stripeSubscription({ id: 'sub_1', cancel_at_period_end: false }),
      },
    )).toBeNull();
  });

  it('a skipped or stale write emits nothing', () => {
    expect(classifySubscriptionTransition({ stripe_subscription_id: null }, null, {})).toBeNull();
  });
});
