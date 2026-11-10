import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
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
  getUserByEmail,
  getUserForLogin,
  updateUserLastLoginDate,
} = await import('../server/models/userModel.js');
const { prisma } = await import('../server/config/prismaClient.js');
const { logError } = await import('../server/config/loggerFunctions.js');

describe('user lookups never leak the password hash by accident', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getUserByEmail omits the password', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1' });

    await getUserByEmail('a@b.co');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.co' },
      omit: { password: true },
    });
  });

  it('getUserForLogin selects only what the strategy needs, hash included', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', password: 'hash' });

    await getUserForLogin('a@b.co');

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'a@b.co' },
      select: {
        id: true,
        email: true,
        role: true,
        company_id: true,
        email_verified_at: true,
        password: true,
      },
    });
  });

  it('updateUserLastLoginDate omits the password and swallows errors', async () => {
    prisma.user.update.mockRejectedValue(new Error('db down'));

    await expect(updateUserLastLoginDate('user-1')).resolves.toBeNull();

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      omit: { password: true },
    }));
    expect(logError).toHaveBeenCalled();
  });
});
