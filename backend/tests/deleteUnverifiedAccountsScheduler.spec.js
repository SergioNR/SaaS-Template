import { jest } from '@jest/globals';

jest.unstable_mockModule('cron', () => ({
  CronJob: {
    from: jest.fn((config) => ({ config })),
  },
}));

jest.unstable_mockModule('../server/cron/exclusiveCronTick.js', () => ({
  runExclusiveCronTick: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUnverifiedUserIdsRegisteredBeforeInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/emailVerificationTokensModel.js', () => ({
  deleteExpiredEmailVerificationTokensInDb: jest.fn().mockResolvedValue(0),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  deleteUserAndCleanup: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/processLifecycle.js', () => ({
  isShuttingDown: jest.fn().mockReturnValue(false),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
}));

const {
  UNVERIFIED_ACCOUNT_MAX_AGE_MS,
  deleteUnverifiedAccounts,
  deleteUnverifiedAccountsScheduler,
} = await import('../server/cron/deleteUnverifiedAccountsScheduler.js');
const { runExclusiveCronTick } = await import('../server/cron/exclusiveCronTick.js');
const { ADVISORY_LOCK_KEYS } = await import('../server/config/advisoryLockKeys.js');
const { getUnverifiedUserIdsRegisteredBeforeInDb } = await import('../server/models/userModel.js');
const { deleteExpiredEmailVerificationTokensInDb } = await import('../server/models/emailVerificationTokensModel.js');
const { deleteUserAndCleanup } = await import('../server/utils/userDeletionCleanup.js');
const { logError } = await import('../server/config/loggerFunctions.js');
const { isShuttingDown } = await import('../server/utils/processLifecycle.js');

describe('deleteUnverifiedAccountsScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs daily at 03:45, never overlaps itself and uses its own advisory lock key', async () => {
    const { config } = deleteUnverifiedAccountsScheduler;

    expect(config.cronTime).toBe('45 3 * * *');
    expect(config.waitForCompletion).toBe(true);

    await config.onTick();

    const keys = Object.values(ADVISORY_LOCK_KEYS);
    expect(new Set(keys).size).toBe(keys.length);
    expect(runExclusiveCronTick).toHaveBeenCalledWith(
      'deleteUnverifiedAccounts',
      ADVISORY_LOCK_KEYS.cronUnverifiedAccounts,
      deleteUnverifiedAccounts,
    );
  });

  it('deletes accounts unverified for 7 days through the shared deletion path, re-checked under lock', async () => {
    const now = new Date('2026-11-12T03:30:00Z');
    getUnverifiedUserIdsRegisteredBeforeInDb.mockResolvedValue(['old-1', 'old-2']);
    deleteUserAndCleanup
      .mockResolvedValueOnce({ status: 'deleted' })
      .mockResolvedValueOnce({ status: 'verified' });
    deleteExpiredEmailVerificationTokensInDb.mockResolvedValue(4);

    const result = await deleteUnverifiedAccounts(now);

    expect(UNVERIFIED_ACCOUNT_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(getUnverifiedUserIdsRegisteredBeforeInDb).toHaveBeenCalledWith(new Date(now.getTime() - UNVERIFIED_ACCOUNT_MAX_AGE_MS));
    expect(deleteUserAndCleanup).toHaveBeenCalledWith('old-1', { onlyIfUnverified: true, actorKind: 'system' });
    expect(deleteUserAndCleanup).toHaveBeenCalledWith('old-2', { onlyIfUnverified: true, actorKind: 'system' });
    expect(result).toEqual({ deletedCount: 1, deletedTokenCount: 4 });
  });

  it('logs a failed account and keeps purging the others', async () => {
    getUnverifiedUserIdsRegisteredBeforeInDb.mockResolvedValue(['bad', 'good']);
    deleteUserAndCleanup
      .mockRejectedValueOnce(new Error('db hiccup'))
      .mockResolvedValueOnce({ status: 'deleted' });

    const result = await deleteUnverifiedAccounts();

    expect(logError).toHaveBeenCalledWith('Could not purge unverified account bad', expect.any(Error));
    expect(result.deletedCount).toBe(1);
    expect(deleteExpiredEmailVerificationTokensInDb).toHaveBeenCalled();
  });

  //* runExclusiveCronTick owns the warn-first rules for outages and
  //* shutdowns - one alert per remaining account would bypass them
  it('rethrows a transient database error instead of alerting per account', async () => {
    getUnverifiedUserIdsRegisteredBeforeInDb.mockResolvedValue(['a', 'b']);
    deleteUserAndCleanup.mockRejectedValue(Object.assign(new Error('connection refused'), { code: 'ECONNREFUSED' }));

    await expect(deleteUnverifiedAccounts()).rejects.toMatchObject({ code: 'ECONNREFUSED' });

    expect(deleteUserAndCleanup).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('rethrows any failure once the shutdown started', async () => {
    getUnverifiedUserIdsRegisteredBeforeInDb.mockResolvedValue(['a', 'b']);
    deleteUserAndCleanup.mockRejectedValue(new Error('pool closed'));
    isShuttingDown.mockReturnValueOnce(true);

    await expect(deleteUnverifiedAccounts()).rejects.toThrow('pool closed');

    expect(logError).not.toHaveBeenCalled();
  });
});
