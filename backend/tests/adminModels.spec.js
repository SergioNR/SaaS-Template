import { jest } from '@jest/globals';

//* The generated Prisma client needs a live database, so the client itself is
//* mocked - these specs assert the redaction/mapping the models add on top
jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    company: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

//* Real posthog/logger modules have import-time side effects (clients), and
//* none of these code paths depend on them
jest.unstable_mockModule('../server/models/posthogModel.js', () => ({
  posthogUserSignedUp: jest.fn(),
  posthogUserDeleteAccount: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const { getUserDetailInDb } = await import('../server/models/userModel.js');
const {
  getAllCompaniesInDb,
  getCompanyDetailInDb,
} = await import('../server/models/companyModel.js');
const { prisma } = await import('../server/config/prismaClient.js');

describe('getUserDetailInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    const result = await getUserDetailInDb('missing');

    expect(result).toBeNull();
  });

  it('reduces the company to a safe shape with a stripeLinked boolean', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      role: 'user',
      company_id: 'company-1',
      created_at: '2026-01-01T00:00:00.000Z',
      Company: {
        id: 'company-1',
        name: 'Acme',
        stripe_id: 'cus_secret123',
        //* Prisma models Company -> Subscription as a list (unique FK),
        //* so the include returns an array of 0 or 1 rows
        Subscription: [
          {
            id: 'sub-1',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2027-01-01T00:00:00.000Z',
          },
        ],
      },
    });

    const result = await getUserDetailInDb('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'user@test.com',
      role: 'user',
      company_id: 'company-1',
      created_at: '2026-01-01T00:00:00.000Z',
      company: {
        id: 'company-1',
        name: 'Acme',
        stripeLinked: true,
        subscription: {
          id: 'sub-1',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2027-01-01T00:00:00.000Z',
        },
      },
    });
    expect(JSON.stringify(result)).not.toContain('stripe_id');
    expect(JSON.stringify(result)).not.toContain('cus_secret123');
    expect(result.Company).toBeUndefined();
  });

  it('handles a company without a Stripe customer id or subscription', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.com',
      Company: {
        id: 'company-1',
        name: null,
        stripe_id: null,
        Subscription: [],
      },
    });

    const result = await getUserDetailInDb('user-1');

    expect(result.company).toEqual({
      id: 'company-1',
      name: null,
      stripeLinked: false,
      subscription: null,
    });
  });
});

describe('getAllCompaniesInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps every row to a redacted shape with userCount and stripeLinked', async () => {
    prisma.company.findMany.mockResolvedValue([
      {
        id: 'company-1',
        name: 'Acme',
        stripe_id: 'cus_secret123',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        _count: { User: 2 },
        Subscription: [
          { id: 'sub-1', expires_at: null },
        ],
      },
      {
        id: 'company-2',
        name: null,
        stripe_id: null,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        _count: { User: 0 },
        Subscription: [],
      },
    ]);

    const results = await getAllCompaniesInDb({}, { limit: 50 });

    expect(results).toEqual([
      {
        id: 'company-1',
        name: 'Acme',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        subscription: { id: 'sub-1', expires_at: null },
        stripeLinked: true,
        userCount: 2,
      },
      {
        id: 'company-2',
        name: null,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        subscription: null,
        stripeLinked: false,
        userCount: 0,
      },
    ]);
    expect(JSON.stringify(results)).not.toContain('stripe_id');
    expect(JSON.stringify(results)).not.toContain('_count');
  });

  it('forwards cursor pagination to Prisma', async () => {
    prisma.company.findMany.mockResolvedValue([]);

    await getAllCompaniesInDb({}, { limit: 25, cursor: 'company-9' });

    expect(prisma.company.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 25, skip: 1, cursor: { id: 'company-9' } }),
    );
  });
});

describe('getCompanyDetailInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when the company does not exist', async () => {
    prisma.company.findUnique.mockResolvedValue(null);

    const result = await getCompanyDetailInDb('missing');

    expect(result).toBeNull();
  });

  it('returns the company with safe users and subscription, no Stripe ids', async () => {
    prisma.company.findUnique.mockResolvedValue({
      id: 'company-1',
      name: 'Acme',
      stripe_id: 'cus_secret123',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      Subscription: [
        { id: 'sub-1', expires_at: '2027-01-01T00:00:00.000Z' },
      ],
      User: [
        {
          id: 'user-1', email: 'user@test.com', role: 'user', created_at: '2026-01-01T00:00:00.000Z', last_login_at: null,
        },
      ],
    });

    const result = await getCompanyDetailInDb('company-1');

    expect(result).toEqual({
      id: 'company-1',
      name: 'Acme',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      stripeLinked: true,
      subscription: { id: 'sub-1', expires_at: '2027-01-01T00:00:00.000Z' },
      users: [
        {
          id: 'user-1', email: 'user@test.com', role: 'user', created_at: '2026-01-01T00:00:00.000Z', last_login_at: null,
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain('stripe_id');
    expect(JSON.stringify(result)).not.toContain('cus_secret123');
  });
});
