import { jest } from '@jest/globals';

//* The generated Prisma client needs a live database, so `$transaction` runs
//* the callback against a mocked interactive-transaction client (`tx`)
const tx = {
  $queryRaw: jest.fn(),
  user: {
    create: jest.fn(),
    update: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  teamInvites: {
    deleteMany: jest.fn(),
  },
  session: {
    deleteMany: jest.fn(),
  },
  passwordResetTokens: {
    deleteMany: jest.fn(),
  },
};

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    $transaction: jest.fn((callback) => callback(tx)),
    role: {
      findUnique: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
  },
}));

jest.unstable_mockModule('../server/models/posthogModel.js', () => ({
  posthogUserSignedUp: jest.fn(),
  posthogUserDeleteAccount: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const {
  canCompanyMemberGrantRoleInDb,
  createUserInDb,
  updateCompanyMemberRoleInDb,
  updateUserPasswordInDb,
} = await import('../server/models/userModel.js');
const { prisma } = await import('../server/config/prismaClient.js');
const { posthogUserSignedUp } = await import('../server/models/posthogModel.js');
const { hashSecureToken } = await import('../server/utils/secureToken.js');

const inviteAcceptance = {
  username: 'new@acme.test',
  password: '$2a$12$hash',
  companyId: 'company-1',
  roleId: 'role-member',
  roleName: 'company_member',
  invitedBy: 'inviter-1',
  inviteId: 'invite-1',
  inviteToken: 'raw-invite-token',
};

const inviterRow = (roleNames) => ({ UserRoles: roleNames.map((name) => ({ Role: { name } })) });

describe('createUserInDb - invite acceptance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.findFirst.mockResolvedValue(inviterRow(['company_admin']));
  });

  it('locks the company, re-checks the inviter, then consumes the invite conditionally before creating the user', async () => {
    tx.teamInvites.deleteMany.mockResolvedValue({ count: 1 });
    tx.user.create.mockResolvedValue({ id: 'new-user', role: 'user' });

    const acceptResult = await createUserInDb(inviteAcceptance);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inviter-1', company_id: 'company-1' },
    }));
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(tx.user.findFirst.mock.invocationCallOrder[0]);
    expect(tx.user.findFirst.mock.invocationCallOrder[0]).toBeLessThan(tx.teamInvites.deleteMany.mock.invocationCallOrder[0]);
    expect(tx.teamInvites.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'invite-1',
        token_hash: hashSecureToken('raw-invite-token'),
        token_expires: { gt: expect.any(Date) },
      },
    });
    expect(tx.teamInvites.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(tx.user.create.mock.invocationCallOrder[0]);
    expect(tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: 'new@acme.test', company_id: 'company-1', role: 'user' }),
      omit: { password: true },
    }));
    expect(acceptResult).toEqual({ status: 'created', user: { id: 'new-user', role: 'user' } });
    expect(posthogUserSignedUp).toHaveBeenCalled();
  });

  it('voids the invite and resolves to inviter_invalid when the inviter left the company under the lock', async () => {
    tx.user.findFirst.mockResolvedValue(null);
    tx.teamInvites.deleteMany.mockResolvedValue({ count: 1 });

    const acceptResult = await createUserInDb(inviteAcceptance);

    expect(acceptResult).toEqual({ status: 'inviter_invalid' });
    expect(tx.teamInvites.deleteMany).toHaveBeenCalledWith({ where: { id: 'invite-1' } });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(posthogUserSignedUp).not.toHaveBeenCalled();
  });

  it('resolves to inviter_invalid when the inviter was demoted below the invited role', async () => {
    tx.user.findFirst.mockResolvedValue(inviterRow(['company_member']));

    const acceptResult = await createUserInDb({ ...inviteAcceptance, roleName: 'company_admin' });

    expect(acceptResult).toEqual({ status: 'inviter_invalid' });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('creates nothing and resolves to invite_invalid when the invite was already consumed, revoked or expired', async () => {
    tx.teamInvites.deleteMany.mockResolvedValue({ count: 0 });

    const acceptResult = await createUserInDb(inviteAcceptance);

    expect(acceptResult).toEqual({ status: 'invite_invalid' });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(posthogUserSignedUp).not.toHaveBeenCalled();
  });
});

describe('canCompanyMemberGrantRoleInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('is false when the member no longer belongs to the company', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(canCompanyMemberGrantRoleInDb('inviter-1', 'company-1', 'company_member')).resolves.toBe(false);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'inviter-1', company_id: 'company-1' },
    }));
  });

  it('is false when the member ranks below the role', async () => {
    prisma.user.findFirst.mockResolvedValue(inviterRow(['company_member']));

    await expect(canCompanyMemberGrantRoleInDb('inviter-1', 'company-1', 'company_admin')).resolves.toBe(false);
  });

  it('is true when the member holds the role or a superior one', async () => {
    prisma.user.findFirst.mockResolvedValue(inviterRow(['company_admin']));

    await expect(canCompanyMemberGrantRoleInDb('inviter-1', 'company-1', 'company_admin')).resolves.toBe(true);
  });
});

describe('createUserInDb - self-registration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws a clear error when the company owner role was never seeded', async () => {
    prisma.role.findUnique.mockResolvedValue(null);

    await expect(createUserInDb({ username: 'new@acme.test', password: 'hash', companyName: 'Acme' })).rejects.toThrow('Company owner role');
  });
});

describe('updateUserPasswordInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes the hash, revokes reset tokens and every other session in one transaction', async () => {
    tx.user.update.mockResolvedValue({ id: 'user-1' });
    tx.passwordResetTokens.deleteMany.mockResolvedValue({ count: 1 });
    tx.session.deleteMany.mockResolvedValue({ count: 2 });

    const updatedUser = await updateUserPasswordInDb('user-1', 'new-hash', { keepSessionId: 'sid-current' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-1' },
      data: { password: 'new-hash' },
    }));
    expect(tx.passwordResetTokens.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1', sid: { not: 'sid-current' } } });
    expect(updatedUser).toEqual({ id: 'user-1' });
  });

  it('propagates a failing step so nothing half-applied is reported as success', async () => {
    tx.user.update.mockResolvedValue({ id: 'user-1' });
    tx.passwordResetTokens.deleteMany.mockResolvedValue({ count: 0 });
    tx.session.deleteMany.mockRejectedValue(new Error('db down'));

    await expect(updateUserPasswordInDb('user-1', 'new-hash', { keepSessionId: 'sid-current' })).rejects.toThrow('db down');
  });
});

describe('updateCompanyMemberRoleInDb', () => {
  const memberWithRoles = (roleNames) => ({
    UserRoles: roleNames.map((name) => ({ Role: { name } })),
  });

  const memberRole = { id: 'role-member', name: 'company_member' };

  beforeEach(() => {
    jest.clearAllMocks();
    tx.user.count.mockResolvedValue(2);
    tx.teamInvites.deleteMany.mockResolvedValue({ count: 0 });
  });

  it('re-reads the caller roles under the lock and refuses when they no longer outrank the target', async () => {
    tx.user.findFirst
      .mockResolvedValueOnce(memberWithRoles(['company_admin'])) //* target
      .mockResolvedValueOnce(memberWithRoles(['company_admin'])); //* caller, demoted meanwhile

    const result = await updateCompanyMemberRoleInDb('target', 'company-1', memberRole, { callerId: 'caller' });

    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'forbidden' });
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('refuses when the caller is no longer a member of the company', async () => {
    tx.user.findFirst
      .mockResolvedValueOnce(memberWithRoles(['company_member']))
      .mockResolvedValueOnce(null);

    const result = await updateCompanyMemberRoleInDb('target', 'company-1', memberRole, { callerId: 'caller' });

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('refuses when the caller cannot grant the new role', async () => {
    tx.user.findFirst
      .mockResolvedValueOnce(memberWithRoles(['company_member']))
      .mockResolvedValueOnce(memberWithRoles(['company_admin']));

    const result = await updateCompanyMemberRoleInDb('target', 'company-1', { id: 'role-owner', name: 'company_owner' }, { callerId: 'caller' });

    expect(result).toEqual({ status: 'forbidden' });
  });

  it('updates the role and voids the invites the demoted member can no longer vouch for', async () => {
    tx.user.findFirst
      .mockResolvedValueOnce(memberWithRoles(['company_admin']))
      .mockResolvedValueOnce(memberWithRoles(['company_owner']));
    tx.user.update.mockResolvedValue({ id: 'target', UserRoles: [{ Role: { name: 'company_member' } }] });

    const result = await updateCompanyMemberRoleInDb('target', 'company-1', memberRole, { callerId: 'caller' });

    expect(result.status).toBe('updated');
    expect(tx.teamInvites.deleteMany).toHaveBeenCalledWith({
      where: {
        invited_by: 'target',
        Role: { name: { notIn: ['company_member'] } },
      },
    });
  });
});
