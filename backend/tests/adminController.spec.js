import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getAllUsersInDb: jest.fn(),
  countUsersInDb: jest.fn(),
  getUserById: jest.fn(),
  getUserDetailInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/companyModel.js', () => ({
  getAllCompaniesInDb: jest.fn(),
  countCompaniesInDb: jest.fn(),
  getCompanyDetailInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/subscriptionModel.js', () => ({
  countActiveSubscriptionsInDb: jest.fn(),
  countTotalSubscriptionsInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/sessionModel.js', () => ({
  countActiveSessionsInDb: jest.fn(),
  countActiveSessionsByUserInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  deleteUserAndCleanup: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logAudit: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const { logAudit } = await import('../server/config/loggerFunctions.js');

const {
  deleteOneUserById,
  getAdminStats,
  getAllCompanies,
  getAllUsers,
  getOneCompanyById,
  getOneUserById,
} = await import('../server/controllers/adminController.js');
const {
  getAllUsersInDb,
  countUsersInDb,
  getUserById,
  getUserDetailInDb,
} = await import('../server/models/userModel.js');
const {
  getAllCompaniesInDb,
  countCompaniesInDb,
  getCompanyDetailInDb,
} = await import('../server/models/companyModel.js');
const {
  countActiveSubscriptionsInDb,
  countTotalSubscriptionsInDb,
} = await import('../server/models/subscriptionModel.js');
const {
  countActiveSessionsInDb,
  countActiveSessionsByUserInDb,
} = await import('../server/models/sessionModel.js');
const { deleteUserAndCleanup } = await import('../server/utils/userDeletionCleanup.js');

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

const userSummary = (id, email) => ({
  id,
  email,
  role: 'user',
  created_at: '2026-01-01T00:00:00.000Z',
  Company: { id: `company-${id}`, name: 'Acme' },
});

describe('getAllUsers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes only whitelisted filters and pagination to the model', async () => {
    getAllUsersInDb.mockResolvedValue([]);
    countUsersInDb.mockResolvedValue(0);
    const res = mockRes();

    await getAllUsers(
      {
        query: {
          role: 'superadmin', search: 'acme@test.com', hackerParam: 'DROP TABLE', limit: '10',
        },
      },
      res,
    );

    expect(getAllUsersInDb).toHaveBeenCalledWith(
      {
        role: 'superadmin',
        email: { contains: 'acme@test.com', mode: 'insensitive' },
      },
      { limit: 10, cursor: undefined },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ userCount: 0, users: [] }),
    );
  });

  it('returns nextCursor when the page is full', async () => {
    const users = Array.from({ length: 2 }, (_, i) => userSummary(`user-${i}`, `u${i}@test.com`));
    getAllUsersInDb.mockResolvedValue(users);
    countUsersInDb.mockResolvedValue(10);
    const res = mockRes();

    await getAllUsers({ query: { limit: '2' } }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ users, nextCursor: 'user-1' }),
    );
  });

  it('omits nextCursor when the page is not full', async () => {
    getAllUsersInDb.mockResolvedValue([userSummary('user-0', 'u0@test.com')]);
    countUsersInDb.mockResolvedValue(1);
    const res = mockRes();

    await getAllUsers({ query: {} }, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ nextCursor: undefined }),
    );
  });
});

describe('getOneUserById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when the user does not exist', async () => {
    getUserDetailInDb.mockResolvedValue(null);
    const res = mockRes();

    await getOneUserById({ params: { userId: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(countActiveSessionsByUserInDb).not.toHaveBeenCalled();
  });

  it('returns the user detail with the active session count', async () => {
    const detail = {
      id: 'user-1',
      email: 'user@test.com',
      role: 'user',
      company: {
        id: 'company-1', name: 'Acme', stripeLinked: true, subscription: null,
      },
    };
    getUserDetailInDb.mockResolvedValue(detail);
    countActiveSessionsByUserInDb.mockResolvedValue(2);
    const res = mockRes();

    await getOneUserById({ params: { userId: 'user-1' } }, res);

    expect(countActiveSessionsByUserInDb).toHaveBeenCalledWith('user-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      user: { ...detail, activeSessionCount: 2 },
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('password');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('stripe_id');
  });
});

describe('deleteOneUserById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refuses self-deletion with 409', async () => {
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'admin-1' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    getUserById.mockResolvedValue(null);
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'ghost' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });

  it('runs the transactional deletion with the last-owner guard and returns the deleted id', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockResolvedValue({ status: 'deleted', deletedUser: { id: 'user-1', company_id: 'company-1' } });
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, res);

    expect(deleteUserAndCleanup).toHaveBeenCalledWith('user-1', { protectLastOwner: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ userId: 'user-1' });
    //* The acting superadmin rides on the audit line (req.user)
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ user: { id: 'admin-1' } }),
      'admin.user.deleted',
      { entity: 'user', entityId: 'user-1' },
    );
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('audits the company removal when the deleted user was its last member', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockResolvedValue({
      status: 'deleted',
      deletedUser: { id: 'user-1' },
      companyDeleted: true,
      companyId: 'company-1',
    });

    await deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, mockRes());

    expect(logAudit).toHaveBeenCalledWith(expect.anything(), 'admin.company.deleted', { entity: 'company', entityId: 'company-1' });
  });

  it('returns 409 LAST_SUPERADMIN when the target is the last superadmin', async () => {
    getUserById.mockResolvedValue({ id: 'staff-2' });
    deleteUserAndCleanup.mockResolvedValue({ status: 'last_superadmin' });
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'staff-2' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LAST_SUPERADMIN' }));
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('returns 409 with a stable code when the user is the last owner of a company with other members', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockResolvedValue({ status: 'last_owner' });
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LAST_COMPANY_OWNER' }));
  });

  it('returns 404 when the user vanished before the transaction', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockResolvedValue({ status: 'not_found' });
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('maps the Prisma FK constraint error of the deletion to 409', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }));
    const res = mockRes();

    await deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('forwards errors that are not FK violations', async () => {
    getUserById.mockResolvedValue({ id: 'user-1' });
    deleteUserAndCleanup.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(deleteOneUserById({ params: { userId: 'user-1' }, user: { id: 'admin-1' } }, res)).rejects.toThrow('db down');
  });
});

describe('getAllCompanies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes only the whitelisted name search to the model', async () => {
    getAllCompaniesInDb.mockResolvedValue([]);
    countCompaniesInDb.mockResolvedValue(0);
    const res = mockRes();

    await getAllCompanies({ query: { search: 'acme', junk: '1' } }, res);

    expect(getAllCompaniesInDb).toHaveBeenCalledWith(
      { name: { contains: 'acme', mode: 'insensitive' } },
      { limit: 50, cursor: undefined },
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ companyCount: 0, companies: [] }),
    );
  });
});

describe('getOneCompanyById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when the company does not exist', async () => {
    getCompanyDetailInDb.mockResolvedValue(null);
    const res = mockRes();

    await getOneCompanyById({ params: { companyId: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns the company detail envelope', async () => {
    const detail = {
      id: 'company-1',
      name: 'Acme',
      stripeLinked: false,
      subscription: { id: 'sub-1', expires_at: null },
      users: [{ id: 'user-1', email: 'user@test.com', role: 'user' }],
    };
    getCompanyDetailInDb.mockResolvedValue(detail);
    const res = mockRes();

    await getOneCompanyById({ params: { companyId: 'company-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      company: detail,
    });
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('stripe_id');
    expect(JSON.stringify(res.json.mock.calls[0][0])).not.toContain('password');
  });
});

describe('getAdminStats', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('composes all counters into the stats envelope', async () => {
    countUsersInDb.mockImplementation(async (filters = {}) => {
      if (filters.role === 'superadmin') return 2;
      if (filters.created_at) return 3;
      return 10;
    });
    countCompaniesInDb.mockResolvedValue(4);
    countTotalSubscriptionsInDb.mockResolvedValue(5);
    countActiveSubscriptionsInDb.mockResolvedValue(3);
    countActiveSessionsInDb.mockResolvedValue(7);
    const res = mockRes();

    await getAdminStats({}, res);

    expect(countUsersInDb).toHaveBeenCalledTimes(3);
    expect(countActiveSubscriptionsInDb).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      stats: {
        totalUsers: 10,
        totalSuperadmins: 2,
        newUsersLastWeek: 3,
        totalCompanies: 4,
        totalSubscriptions: 5,
        activeSubscriptions: 3,
        activeSessions: 7,
      },
    });
  });
});
