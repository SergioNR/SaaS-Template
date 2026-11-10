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
    },
  },
}));

const {
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
    const stored = { stripe_subscription_id: null, stripe_synced_at: null };
    tx.subscription.findUnique.mockResolvedValue(stored);

    const result = await syncSubscriptionWithCompanyLockInDb('company-1', () => write());

    //* The previous row and the applied write - the webhook classifies the
    //* transition (business events) from them after the commit
    expect(result).toEqual({ previous: stored, written: write() });
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

    const result = await syncSubscriptionWithCompanyLockInDb('company-1', () => write({ syncedAt: EARLIER }));

    expect(result).toBeNull();
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });

  it('applies an older read when it concerns a different subscription (replacement rules decide)', async () => {
    tx.subscription.findUnique.mockResolvedValue({ stripe_subscription_id: 'sub_old', stripe_synced_at: LATER });

    const result = await syncSubscriptionWithCompanyLockInDb('company-1', () => write({ syncedAt: EARLIER }));

    expect(result).toEqual(expect.objectContaining({ written: write({ syncedAt: EARLIER }) }));
  });

  it('skips when the resolver returns null', async () => {
    tx.subscription.findUnique.mockResolvedValue(null);

    await expect(syncSubscriptionWithCompanyLockInDb('company-1', () => null)).resolves.toBeNull();
    expect(tx.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe('getSubscriptionPublicDataInDb', () => {
  it('derives is_paid from the Stripe subscription id and never returns ids', async () => {
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
      is_paid: true,
      has_billing_id: true,
    });
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
      is_paid: false,
      has_billing_id: false,
    }));
  });
});
