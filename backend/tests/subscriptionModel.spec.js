import { jest } from '@jest/globals';

const tx = {
  $queryRaw: jest.fn(),
  subscription: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    $transaction: jest.fn((callback) => callback(tx)),
    subscription: {
      findUnique: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const {
  countActiveSubscriptionsInDb,
  countActiveTrialsInDb,
  getSubscriptionPublicDataInDb,
  syncSubscriptionWithCompanyLockInDb,
} = await import('../server/models/subscriptionModel.js');
const { prisma } = await import('../server/config/prismaClient.js');

const EARLIER = new Date('2030-01-01T00:00:00.000Z');
const LATER = new Date('2030-01-01T00:00:05.000Z');

const write = (overrides = {}) => ({
  stripeSubscriptionId: 'sub_1',
  status: 'active',
  expiresAt: new Date('2030-02-01T00:00:00Z'),
  syncedAt: LATER,
  ...overrides,
});

describe('syncSubscriptionWithCompanyLockInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('locks the company before reading the stored row and writes the Stripe fields', async () => {
    tx.subscription.findUnique.mockResolvedValue({ stripe_subscription_id: null, stripe_synced_at: null });

    const written = await syncSubscriptionWithCompanyLockInDb('company-1', () => write());

    expect(written).toBe(true);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.subscription.findUnique.mock.invocationCallOrder[0]);
    expect(tx.subscription.upsert).toHaveBeenCalledWith({
      where: { company_id: 'company-1' },
      update: {
        stripe_subscription_id: 'sub_1',
        stripe_status: 'active',
        stripe_synced_at: LATER,
        expires_at: write().expiresAt,
      },
      create: {
        stripe_subscription_id: 'sub_1',
        stripe_status: 'active',
        stripe_synced_at: LATER,
        expires_at: write().expiresAt,
        company_id: 'company-1',
      },
    });
  });

  it('drops a write based on an older Stripe read of the same subscription', async () => {
    tx.subscription.findUnique.mockResolvedValue({ stripe_subscription_id: 'sub_1', stripe_synced_at: LATER });

    const written = await syncSubscriptionWithCompanyLockInDb('company-1', () => write({ syncedAt: EARLIER }));

    expect(written).toBe(false);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it('applies an older read when it concerns a different subscription (replacement rules decide)', async () => {
    tx.subscription.findUnique.mockResolvedValue({ stripe_subscription_id: 'sub_old', stripe_synced_at: LATER });

    const written = await syncSubscriptionWithCompanyLockInDb('company-1', () => write({ syncedAt: EARLIER }));

    expect(written).toBe(true);
  });

  it('skips when the resolver returns null', async () => {
    tx.subscription.findUnique.mockResolvedValue(null);

    await expect(syncSubscriptionWithCompanyLockInDb('company-1', () => null)).resolves.toBe(false);
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('getSubscriptionPublicDataInDb', () => {
  it('reports an unexpired Stripe-backed row as paid and never returns ids', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      stripe_subscription_id: 'sub_1',
      expires_at: EARLIER,
      created_at: EARLIER,
      updated_at: EARLIER,
      Company: { stripe_id: 'cus_1' },
    });

    const publicData = await getSubscriptionPublicDataInDb('company-1');

    expect(publicData).toEqual({
      expires_at: EARLIER,
      created_at: EARLIER,
      updated_at: EARLIER,
      status: 'paid',
      is_paid: true,
      has_billing_id: true,
    });
  });

  it('reports an ENDED paid subscription as inactive and not paid, keeping has_billing_id', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      stripe_subscription_id: 'sub_1',
      expires_at: new Date('2020-01-01T00:00:00Z'),
      created_at: EARLIER,
      updated_at: EARLIER,
      Company: { stripe_id: 'cus_1' },
    });

    await expect(getSubscriptionPublicDataInDb('company-1')).resolves.toEqual(expect.objectContaining({
      status: 'inactive',
      is_paid: false,
      has_billing_id: true,
    }));
  });

  it('reports trials (no Stripe subscription) as unpaid', async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      stripe_subscription_id: null,
      expires_at: EARLIER,
      created_at: EARLIER,
      updated_at: EARLIER,
      Company: { stripe_id: null },
    });

    await expect(getSubscriptionPublicDataInDb('company-1')).resolves.toEqual(expect.objectContaining({
      status: 'trial',
      is_paid: false,
      has_billing_id: false,
    }));
  });
});

describe('active subscription counters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('counts only Stripe-backed unexpired rows as active subscriptions', async () => {
    prisma.subscription.count.mockResolvedValue(1);

    await expect(countActiveSubscriptionsInDb()).resolves.toBe(1);
    expect(prisma.subscription.count).toHaveBeenCalledWith({
      where: { stripe_subscription_id: { not: null }, expires_at: { gt: expect.any(Date) } },
    });
  });

  it('counts unexpired rows without a Stripe subscription as active trials', async () => {
    prisma.subscription.count.mockResolvedValue(2);

    await expect(countActiveTrialsInDb()).resolves.toBe(2);
    expect(prisma.subscription.count).toHaveBeenCalledWith({
      where: { stripe_subscription_id: null, expires_at: { gt: expect.any(Date) } },
    });
  });
});
