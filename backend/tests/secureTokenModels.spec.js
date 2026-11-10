import { createHash } from 'node:crypto';
import { jest } from '@jest/globals';

const prismaMock = {
  teamInvites: {
    create: jest.fn(),
    deleteMany: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  passwordResetTokens: {
    deleteMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  emailVerificationTokens: {
    deleteMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    update: jest.fn(),
  },
  session: {
    deleteMany: jest.fn(),
  },
  $transaction: jest.fn(),
};

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const {
  SECURE_TOKEN_PATTERN,
  generateSecureToken,
  hashSecureToken,
} = await import('../server/utils/secureToken.js');
const {
  createTeamInviteInDb,
  getCompanyPendingInvitesInDb,
  getPendingTeamInviteByCompanyAndEmailInDb,
  getTeamInviteByTokenInDb,
  rotateTeamInviteTokenInDb,
} = await import('../server/models/teamInvitesModel.js');
const {
  createPasswordResetToken,
  getPasswordResetTokenData,
  resetUserPasswordWithTokenInDb,
} = await import('../server/models/passwordResetTokensModel.js');
const {
  EMAIL_VERIFICATION_TOKEN_TTL_MS,
  consumeEmailVerificationTokenInDb,
  createEmailVerificationTokenInDb,
  deleteExpiredEmailVerificationTokensInDb,
} = await import('../server/models/emailVerificationTokensModel.js');

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

describe('secureToken', () => {
  it('generates 256-bit base64url tokens matching the validator pattern', () => {
    const token = generateSecureToken();

    expect(token).toMatch(SECURE_TOKEN_PATTERN);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(generateSecureToken()).not.toBe(token);
  });

  it('hashes to the sha256 hex digest', () => {
    expect(hashSecureToken('abc')).toBe(sha256('abc'));
  });

  it('rejects UUIDs and other malformed tokens', () => {
    expect('8f14e45f-ceea-4672-a7a8-1b6a1f0c1e8b').not.toMatch(SECURE_TOKEN_PATTERN);
    expect(`${generateSecureToken()}=`).not.toMatch(SECURE_TOKEN_PATTERN);
  });
});

describe('teamInvitesModel tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores only the digest of the generated token and returns the raw token separately', async () => {
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.teamInvites.create.mockImplementation(async ({ data }) => ({ id: 'invite-1', email: data.email }));

    const { invite, inviteToken } = await createTeamInviteInDb({
      email: 'new@acme.test', companyId: 'company-1', roleId: 'role-member', invitedBy: 'owner-1',
    });

    const [{ data, omit }] = prismaMock.teamInvites.create.mock.calls[0];
    expect(inviteToken).toMatch(SECURE_TOKEN_PATTERN);
    expect(data.token_hash).toBe(sha256(inviteToken));
    expect(JSON.stringify(data)).not.toContain(inviteToken);
    expect(omit).toEqual({ token_hash: true });
    expect(invite).toEqual({ id: 'invite-1', email: 'new@acme.test' });
  });

  it('replaces only an EXPIRED invite for the same address, in the same transaction as the create', async () => {
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.teamInvites.create.mockResolvedValue({ id: 'invite-2' });

    await createTeamInviteInDb({
      email: 'new@acme.test', companyId: 'company-1', roleId: 'role-member', invitedBy: 'owner-1',
    });

    expect(prismaMock.teamInvites.deleteMany).toHaveBeenCalledWith({
      where: {
        company_id: 'company-1',
        email: 'new@acme.test',
        token_expires: { lte: expect.any(Date) },
      },
    });
    expect(prismaMock.teamInvites.deleteMany.mock.invocationCallOrder[0])
      .toBeLessThan(prismaMock.teamInvites.create.mock.invocationCallOrder[0]);
  });

  it('never treats an expired invite as pending', async () => {
    prismaMock.teamInvites.findFirst.mockResolvedValue(null);
    prismaMock.teamInvites.findMany.mockResolvedValue([]);

    await getPendingTeamInviteByCompanyAndEmailInDb('company-1', 'new@acme.test');
    await getCompanyPendingInvitesInDb('company-1');

    expect(prismaMock.teamInvites.findFirst.mock.calls[0][0].where).toEqual({
      company_id: 'company-1',
      email: 'new@acme.test',
      token_expires: { gt: expect.any(Date) },
    });
    expect(prismaMock.teamInvites.findMany.mock.calls[0][0].where).toEqual({
      company_id: 'company-1',
      token_expires: { gt: expect.any(Date) },
    });
  });

  it('looks invites up by the digest of the presented token', async () => {
    prismaMock.teamInvites.findUnique.mockResolvedValue(null);

    await getTeamInviteByTokenInDb('presented-token');

    expect(prismaMock.teamInvites.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { token_hash: sha256('presented-token') },
    }));
  });

  it('rotates the digest in place, keeping the invite id', async () => {
    prismaMock.teamInvites.update.mockResolvedValue({ id: 'invite-1' });

    const { invite, inviteToken } = await rotateTeamInviteTokenInDb('invite-1', 'company-1', 'owner-1');

    const [{ where, data }] = prismaMock.teamInvites.update.mock.calls[0];
    expect(where).toEqual({ id: 'invite-1', company_id: 'company-1' });
    expect(data.token_hash).toBe(sha256(inviteToken));
    expect(invite.id).toBe('invite-1');
  });

  it('returns null when the invite to rotate no longer exists', async () => {
    prismaMock.teamInvites.update.mockRejectedValue(Object.assign(new Error('missing'), { code: 'P2025' }));

    await expect(rotateTeamInviteTokenInDb('invite-1', 'company-1', 'owner-1')).resolves.toBeNull();
  });
});

describe('passwordResetTokensModel tokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('replaces previous tokens and stores only the digest', async () => {
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.passwordResetTokens.create.mockImplementation((args) => args);

    const token = await createPasswordResetToken('user-1');

    const [{ data }] = prismaMock.passwordResetTokens.create.mock.calls[0];
    expect(token).toMatch(SECURE_TOKEN_PATTERN);
    expect(data.token_hash).toBe(sha256(token));
    expect(prismaMock.passwordResetTokens.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
  });

  it('checks validity by digest', async () => {
    prismaMock.passwordResetTokens.findUnique.mockResolvedValue(null);

    await getPasswordResetTokenData('raw');

    expect(prismaMock.passwordResetTokens.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { token_hash: sha256('raw') },
    }));
  });

  describe('resetUserPasswordWithTokenInDb', () => {
    const tx = {
      passwordResetTokens: {
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      emailVerificationTokens: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      user: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      session: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };

    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));
    });

    it('consumes the token conditionally, updates the password and revokes tokens and sessions', async () => {
      tx.passwordResetTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.passwordResetTokens.deleteMany.mockResolvedValue({ count: 1 });

      const result = await resetUserPasswordWithTokenInDb('raw', 'hashed-password');

      expect(result).toEqual({ userId: 'user-1' });
      expect(tx.passwordResetTokens.deleteMany).toHaveBeenNthCalledWith(1, {
        where: { token_hash: sha256('raw'), token_expires: { gt: expect.any(Date) } },
      });
      expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { password: 'hashed-password' } });
      expect(tx.passwordResetTokens.deleteMany).toHaveBeenNthCalledWith(2, { where: { user_id: 'user-1' } });
      expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    });

    it('verifies an unverified account in the same transaction (mailbox proof) and drops its verification links', async () => {
      tx.passwordResetTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.passwordResetTokens.deleteMany.mockResolvedValue({ count: 1 });

      await resetUserPasswordWithTokenInDb('raw', 'hashed-password');

      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', email_verified_at: null },
        data: { email_verified_at: expect.any(Date) },
      });
      expect(tx.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    });

    it('returns null without touching the password when the token is expired or already consumed', async () => {
      tx.passwordResetTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.passwordResetTokens.deleteMany.mockResolvedValue({ count: 0 });

      await expect(resetUserPasswordWithTokenInDb('raw', 'hashed-password')).resolves.toBeNull();
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(tx.session.deleteMany).not.toHaveBeenCalled();
    });

    it('returns null for an unknown token', async () => {
      tx.passwordResetTokens.findUnique.mockResolvedValue(null);

      await expect(resetUserPasswordWithTokenInDb('raw', 'hashed-password')).resolves.toBeNull();
      expect(tx.passwordResetTokens.deleteMany).not.toHaveBeenCalled();
    });
  });
});

describe('emailVerificationTokensModel', () => {
  const tx = {
    emailVerificationTokens: {
      findUnique: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: { updateMany: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('stores only the digest, expires in 24 hours and replaces earlier tokens in one transaction', async () => {
    prismaMock.$transaction.mockResolvedValue([]);
    prismaMock.emailVerificationTokens.deleteMany.mockReturnValue('delete-op');
    prismaMock.emailVerificationTokens.create.mockReturnValue('create-op');

    const before = Date.now();
    const token = await createEmailVerificationTokenInDb('user-1');

    expect(token).toMatch(SECURE_TOKEN_PATTERN);
    expect(prismaMock.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    const [{ data }] = prismaMock.emailVerificationTokens.create.mock.calls[0];
    expect(data.token_hash).toBe(sha256(token));
    expect(JSON.stringify(data)).not.toContain(token);
    expect(data.token_expires.getTime()).toBeGreaterThanOrEqual(before + EMAIL_VERIFICATION_TOKEN_TTL_MS);
    expect(EMAIL_VERIFICATION_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
    expect(prismaMock.$transaction).toHaveBeenCalledWith(['delete-op', 'create-op']);
  });

  describe('consumeEmailVerificationTokenInDb', () => {
    beforeEach(() => {
      prismaMock.$transaction.mockImplementation(async (callback) => callback(tx));
    });

    it('consumes an unexpired token conditionally and verifies the account in the same transaction', async () => {
      tx.emailVerificationTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 1 });
      tx.user.updateMany.mockResolvedValue({ count: 1 });

      await expect(consumeEmailVerificationTokenInDb('raw')).resolves.toEqual({ userId: 'user-1' });
      expect(tx.emailVerificationTokens.deleteMany).toHaveBeenNthCalledWith(1, {
        where: { token_hash: sha256('raw'), token_expires: { gt: expect.any(Date) } },
      });
      expect(tx.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'user-1', email_verified_at: null },
        data: { email_verified_at: expect.any(Date) },
      });
      expect(tx.emailVerificationTokens.deleteMany).toHaveBeenNthCalledWith(2, { where: { user_id: 'user-1' } });
    });

    it('rejects an unknown token', async () => {
      tx.emailVerificationTokens.findUnique.mockResolvedValue(null);

      await expect(consumeEmailVerificationTokenInDb('raw')).resolves.toBeNull();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an expired or already consumed token without verifying', async () => {
      tx.emailVerificationTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 0 });

      await expect(consumeEmailVerificationTokenInDb('raw')).resolves.toBeNull();
      expect(tx.user.updateMany).not.toHaveBeenCalled();
    });

    it('rejects when the account was already verified or deleted meanwhile', async () => {
      tx.emailVerificationTokens.findUnique.mockResolvedValue({ user_id: 'user-1' });
      tx.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 1 });
      tx.user.updateMany.mockResolvedValue({ count: 0 });

      await expect(consumeEmailVerificationTokenInDb('raw')).resolves.toBeNull();
    });
  });

  it('purges only expired tokens', async () => {
    prismaMock.emailVerificationTokens.deleteMany.mockResolvedValue({ count: 3 });

    await expect(deleteExpiredEmailVerificationTokensInDb()).resolves.toBe(3);
    expect(prismaMock.emailVerificationTokens.deleteMany).toHaveBeenCalledWith({
      where: { token_expires: { lt: expect.any(Date) } },
    });
  });
});
