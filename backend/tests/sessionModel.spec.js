import { jest } from '@jest/globals';

const sessionUpdate = jest.fn();
const sessionCount = jest.fn();
const sessionDeleteMany = jest.fn();

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: { session: { update: sessionUpdate, count: sessionCount, deleteMany: sessionDeleteMany } },
}));

const {
  linkSessionToUser,
  deleteUserSessionsInTx,
  deleteUserSessions,
  countActiveSessionsInDb,
  countActiveSessionsByUserInDb,
  deleteExpiredSessionsInDb,
} = await import('../server/models/sessionModel.js');

describe('linkSessionToUser', () => {
  beforeEach(() => {
    sessionUpdate.mockReset();
  });

  it('links the session row to the user by sid', async () => {
    sessionUpdate.mockResolvedValue({ sid: 'session-1', user_id: 'user-1' });

    await linkSessionToUser('session-1', 'user-1');

    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { sid: 'session-1' },
      data: { user_id: 'user-1' },
    });
  });

  it('propagates failures so the login fails instead of creating an unrevocable session', async () => {
    sessionUpdate.mockRejectedValue(new Error('db unreachable'));

    await expect(linkSessionToUser('session-1', 'user-1')).rejects.toThrow('db unreachable');
  });
});

describe('deleteUserSessionsInTx', () => {
  const createTx = () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    return { deleteMany, tx: { session: { deleteMany } } };
  };

  it('revokes every session of the user through the transaction client', async () => {
    const { deleteMany, tx } = createTx();

    const result = await deleteUserSessionsInTx(tx, 'user-1');

    expect(deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
    expect(result).toEqual({ deletedCount: 2 });
  });

  it('keeps the current session when keepSessionId is given (password update path)', async () => {
    const { deleteMany, tx } = createTx();

    await deleteUserSessionsInTx(tx, 'user-1', 'session-current');

    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        user_id: 'user-1',
        sid: { not: 'session-current' },
      },
    });
  });

  it('revokes all sessions when keepSessionId is null', async () => {
    const { deleteMany, tx } = createTx();

    await deleteUserSessionsInTx(tx, 'user-1', null);

    expect(deleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });
  });

  it('propagates failures so the credential write rolls back with the revocation', async () => {
    const deleteMany = jest.fn().mockRejectedValue(new Error('revocation failed'));
    const tx = { session: { deleteMany } };

    await expect(deleteUserSessionsInTx(tx, 'user-1')).rejects.toThrow('revocation failed');
  });
});

describe('deleteUserSessions', () => {
  it('revokes outside a transaction through the shared prisma client and propagates failures', async () => {
    sessionDeleteMany.mockResolvedValueOnce({ count: 1 });

    await expect(deleteUserSessions('user-1')).resolves.toEqual({ deletedCount: 1 });
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { user_id: 'user-1' } });

    sessionDeleteMany.mockRejectedValueOnce(new Error('db down'));

    await expect(deleteUserSessions('user-1')).rejects.toThrow('db down');
  });
});

describe('active session counts', () => {
  beforeEach(() => {
    sessionCount.mockReset();
  });

  it('counts only unexpired sessions', async () => {
    sessionCount.mockResolvedValue(3);

    await expect(countActiveSessionsInDb()).resolves.toBe(3);

    const [{ where }] = sessionCount.mock.calls[0];
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it('scopes the per-user count by user id and expiry - never reads the data blob', async () => {
    sessionCount.mockResolvedValue(1);

    await expect(countActiveSessionsByUserInDb('user-1')).resolves.toBe(1);

    const [args] = sessionCount.mock.calls[0];
    expect(args.where.user_id).toBe('user-1');
    expect(args.where.expiresAt.gt).toBeInstanceOf(Date);
    expect(args).not.toHaveProperty('select');
  });
});

describe('deleteExpiredSessionsInDb', () => {
  beforeEach(() => {
    sessionDeleteMany.mockReset();
  });

  it('deletes only rows whose expiry is in the past and returns the count', async () => {
    sessionDeleteMany.mockResolvedValue({ count: 4 });
    const now = new Date('2026-11-11T00:00:00.000Z');

    await expect(deleteExpiredSessionsInDb(now)).resolves.toBe(4);
    expect(sessionDeleteMany).toHaveBeenCalledWith({ where: { expiresAt: { lt: now } } });
  });

  it('propagates database errors so runExclusiveCronTick can log them', async () => {
    sessionDeleteMany.mockRejectedValue(new Error('db down'));

    await expect(deleteExpiredSessionsInDb()).rejects.toThrow('db down');
  });
});
