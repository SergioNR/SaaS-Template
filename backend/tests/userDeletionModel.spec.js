import { jest } from '@jest/globals';

//* The generated Prisma client needs a live database, so `$transaction` runs
//* the callback against a mocked interactive-transaction client (`tx`)
const tx = {
  $queryRaw: jest.fn(),
  user: {
    findFirst: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  userRole: {
    findMany: jest.fn(),
  },
  session: {
    deleteMany: jest.fn(),
  },
  teamInvites: {
    deleteMany: jest.fn(),
  },
  subscription: {
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  company: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  file: {
    findMany: jest.fn(),
  },
};

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    $transaction: jest.fn((callback) => callback(tx)),
  },
}));

jest.unstable_mockModule('../server/models/posthogModel.js', () => ({
  posthogUserSignedUp: jest.fn(),
  posthogUserDeleteAccount: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logPasswordResetTokenCreated: jest.fn(),
}));

const { deleteUserWithCompanyDataInDb } = await import('../server/models/userModel.js');

describe('deleteUserWithCompanyDataInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes a superadmin without a company and never touches company data', async () => {
    tx.user.findFirst.mockResolvedValue({ id: 'staff-1', company_id: null });
    tx.user.delete.mockResolvedValue({ id: 'staff-1', role: 'superadmin' });

    const result = await deleteUserWithCompanyDataInDb('staff-1', { protectLastOwner: true });

    expect(result).toEqual({
      status: 'deleted',
      deletedUser: { id: 'staff-1', role: 'superadmin' },
      companyDeleted: false,
      subscription: null,
      fileKeys: [],
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'staff-1' } });
    //* A `company_id: null` count would match every other superadmin
    expect(tx.user.count).not.toHaveBeenCalled();
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });

  it('returns not_found when the user does not exist', async () => {
    tx.user.findFirst.mockResolvedValue(null);

    const result = await deleteUserWithCompanyDataInDb('missing');

    expect(result).toEqual({ status: 'not_found' });
    expect(tx.user.delete).not.toHaveBeenCalled();
  });

  describe('company member deletion', () => {
    const rolesOf = (roleNames) => roleNames.map((name) => ({ Role: { name } }));

    beforeEach(() => {
      tx.user.count.mockResolvedValue(2);
      tx.session.deleteMany.mockResolvedValue({ count: 1 });
      tx.teamInvites.deleteMany.mockResolvedValue({ count: 0 });
    });

    it('re-reads the caller roles under the lock and refuses a caller that does not outrank the target', async () => {
      tx.user.findFirst
        .mockResolvedValueOnce({ id: 'target', company_id: 'company-1' })
        .mockResolvedValueOnce({ UserRoles: rolesOf(['company_admin']) }); //* caller, a peer
      tx.userRole.findMany.mockResolvedValue(rolesOf(['company_admin']));

      const result = await deleteUserWithCompanyDataInDb('target', { companyId: 'company-1', callerId: 'caller' });

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.findFirst.mock.invocationCallOrder[1]);
      expect(result).toEqual({ status: 'forbidden' });
      expect(tx.user.delete).not.toHaveBeenCalled();
    });

    it('refuses when the caller left the company meanwhile', async () => {
      tx.user.findFirst
        .mockResolvedValueOnce({ id: 'target', company_id: 'company-1' })
        .mockResolvedValueOnce(null);
      tx.userRole.findMany.mockResolvedValue(rolesOf(['company_member']));

      const result = await deleteUserWithCompanyDataInDb('target', { companyId: 'company-1', callerId: 'caller' });

      expect(result).toEqual({ status: 'forbidden' });
    });

    it('deletes the member, their sessions and the invites they issued', async () => {
      tx.user.findFirst
        .mockResolvedValueOnce({ id: 'target', company_id: 'company-1' })
        .mockResolvedValueOnce({ UserRoles: rolesOf(['company_owner']) });
      tx.userRole.findMany.mockResolvedValue(rolesOf(['company_member']));
      tx.user.delete.mockResolvedValue({ id: 'target', role: 'user' });

      const result = await deleteUserWithCompanyDataInDb('target', { companyId: 'company-1', callerId: 'caller', protectLastOwner: true });

      expect(result).toEqual(expect.objectContaining({ status: 'deleted', companyDeleted: false }));
      expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'target' } });
      expect(tx.teamInvites.deleteMany).toHaveBeenCalledWith({ where: { invited_by: 'target' } });
    });

    it('returns the Stripe customer and subscription ids when the last member takes the company with them', async () => {
      tx.user.findFirst.mockResolvedValueOnce({ id: 'target', company_id: 'company-1' });
      tx.userRole.findMany.mockResolvedValue(rolesOf(['company_owner']));
      tx.user.delete.mockResolvedValue({ id: 'target', role: 'user' });
      tx.user.count.mockResolvedValue(0);
      tx.subscription.findUnique.mockResolvedValue({ stripe_subscription_id: 'sub_1', expires_at: null });
      tx.company.findUnique.mockResolvedValue({ stripe_id: 'cus_1' });
      tx.file.findMany.mockResolvedValue([{ s3_key: 'company-1/f/a.pdf' }]);

      const result = await deleteUserWithCompanyDataInDb('target');

      expect(result).toEqual({
        status: 'deleted',
        deletedUser: { id: 'target', role: 'user' },
        companyDeleted: true,
        companyId: 'company-1',
        stripeCustomerId: 'cus_1',
        subscription: { stripe_subscription_id: 'sub_1', expires_at: null },
        fileKeys: ['company-1/f/a.pdf'],
      });
      expect(tx.company.delete).toHaveBeenCalledWith({ where: { id: 'company-1' } });
    });
  });
});
