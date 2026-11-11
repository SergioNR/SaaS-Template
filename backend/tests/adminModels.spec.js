import { jest } from '@jest/globals';

//* The generated Prisma client needs a live database, so the client itself is
//* mocked - these specs assert the redaction/mapping the models add on top
jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
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

const { getUserDetailInDb, getAllUsersInDb } = await import('../server/models/userModel.js');
const { buildAdminListSort } = await import('../server/utils/adminColumnSorts.js');
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

//* An in-memory stand-in for Prisma's findMany that understands exactly the
//* where/orderBy shapes the sorted list walk emits (equality, gt/lt, null,
//* AND/OR, nulls last) - enough to walk pages the way PostgreSQL would
const matches = (row, where) => Object.entries(where).every(([key, condition]) => {
  if (key === 'AND') return condition.every((part) => matches(row, part));
  if (key === 'OR') return condition.some((part) => matches(row, part));

  const value = row[key];

  if (condition === null) return value === null;
  if (condition instanceof Date || typeof condition !== 'object') {
    return value !== null && String(value instanceof Date ? value.getTime() : value) === String(condition instanceof Date ? condition.getTime() : condition);
  }
  if (value === null) return false;

  const comparable = (input) => (input instanceof Date ? input.getTime() : input);

  if ('gt' in condition) return comparable(value) > comparable(condition.gt);
  if ('lt' in condition) return comparable(value) < comparable(condition.lt);

  return true;
});

const compareClause = (a, b, clause) => {
  const [field, spec] = Object.entries(clause)[0];
  const direction = typeof spec === 'string' ? spec : spec.sort;
  const left = a[field] instanceof Date ? a[field].getTime() : a[field];
  const right = b[field] instanceof Date ? b[field].getTime() : b[field];

  if (left === right) return 0;
  //* nulls last in both directions
  if (left === null) return 1;
  if (right === null) return -1;

  const result = left < right ? -1 : 1;

  return direction === 'asc' ? result : -result;
};

const compareBy = (orderBy) => (a, b) => orderBy
  .map((clause) => compareClause(a, b, clause))
  .find((result) => result !== 0) ?? 0;

describe('getAllUsersInDb sorted cursor walk', () => {
  const day = (n) => new Date(Date.UTC(2026, 0, n));
  const rows = [
    { id: 'u1', email: 'e@x.test', last_login_at: day(3) },
    { id: 'u2', email: 'a@x.test', last_login_at: null },
    { id: 'u3', email: 'c@x.test', last_login_at: day(5) },
    { id: 'u4', email: 'b@x.test', last_login_at: null },
    { id: 'u5', email: 'd@x.test', last_login_at: day(3) },
    { id: 'u6', email: 'f@x.test', last_login_at: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.user.findUnique.mockImplementation(async ({ where }) => rows.find((row) => row.id === where.id) ?? null);
    prisma.user.findMany.mockImplementation(async ({ where, orderBy, take }) => rows
      .filter((row) => matches(row, where))
      .sort(compareBy(orderBy))
      .slice(0, take));
  });

  const walk = async (sort, limit) => {
    const seen = [];
    let cursor;

    for (let page = 0; page < 10; page++) {
      const result = await getAllUsersInDb({}, { limit, cursor }, sort);
      seen.push(...result.map((row) => row.id));

      if (result.length < limit) break;
      cursor = result.at(-1).id;
    }

    return seen;
  };

  it.each([
    ['last_login_at', 'desc', ['u3', 'u5', 'u1', 'u6', 'u4', 'u2']],
    ['last_login_at', 'asc', ['u1', 'u5', 'u3', 'u2', 'u4', 'u6']],
    ['email', 'desc', ['u6', 'u1', 'u5', 'u3', 'u4', 'u2']],
  ])('walks every user once sorted by %s %s, never-logged-in users last', async (key, order, expected) => {
    const sort = buildAdminListSort('users', key, order);

    for (const limit of [1, 2, 4]) {
      expect(await walk(sort, limit)).toEqual(expected);
    }
  });

  it('never sends Prisma a cursor for a sorted list (the keyset replaces it)', async () => {
    await getAllUsersInDb({}, { limit: 2, cursor: 'u5' }, buildAdminListSort('users', 'last_login_at', 'desc'));

    expect(prisma.user.findMany.mock.calls[0][0].cursor).toBeUndefined();
    expect(prisma.user.findMany.mock.calls[0][0].omit).toEqual({ password: true });
  });

  it('answers an empty page when the cursor row was deleted', async () => {
    await expect(getAllUsersInDb({}, { limit: 2, cursor: 'gone' }, buildAdminListSort('users', 'email'))).resolves.toEqual([]);
    expect(prisma.user.findMany).not.toHaveBeenCalled();
  });
});
