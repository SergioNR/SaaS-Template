import { jest } from '@jest/globals';

const tx = {
  $queryRaw: jest.fn(),
};

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    $transaction: jest.fn((callback) => callback(tx)),
  },
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const { runWithAdvisoryLockInDb } = await import('../server/models/advisoryLockModel.js');
const { runExclusiveCronTick } = await import('../server/cron/exclusiveCronTick.js');
const { ADVISORY_LOCK_KEYS } = await import('../server/config/advisoryLockKeys.js');
const { prisma } = await import('../server/config/prismaClient.js');
const { logError, logInfo } = await import('../server/config/loggerFunctions.js');

describe('runWithAdvisoryLockInDb', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs the task while holding a transaction-scoped try-lock on the key', async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: true }]);
    const task = jest.fn().mockResolvedValue('done');

    const outcome = await runWithAdvisoryLockInDb(7300001, task);

    expect(outcome).toEqual({ acquired: true, result: 'done' });
    const [sqlParts, lockKey] = tx.$queryRaw.mock.calls[0];
    expect(sqlParts.join('?')).toContain('pg_try_advisory_xact_lock');
    expect(lockKey).toBe(7300001);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(task.mock.invocationCallOrder[0]);
    //* Long enough for the slowest job, not Prisma's 5s default
    expect(prisma.$transaction.mock.calls[0][1].timeout).toBeGreaterThan(5000);
  });

  it('skips the task when another replica holds the lock', async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: false }]);
    const task = jest.fn();

    await expect(runWithAdvisoryLockInDb(7300001, task)).resolves.toEqual({ acquired: false });
    expect(task).not.toHaveBeenCalled();
  });
});

describe('runExclusiveCronTick', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs a skipped tick at info level only', async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: false }]);

    await runExclusiveCronTick('job', 1, jest.fn());

    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('skipped'));
    expect(logError).not.toHaveBeenCalled();
  });

  it('never throws - task errors are logError-ed', async () => {
    tx.$queryRaw.mockResolvedValue([{ acquired: true }]);

    await expect(runExclusiveCronTick('job', 1, jest.fn().mockRejectedValue(new Error('db down')))).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('job'), expect.any(Error));
  });
});

describe('ADVISORY_LOCK_KEYS', () => {
  it('gives every serialized operation its own key', () => {
    const keys = Object.values(ADVISORY_LOCK_KEYS);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
