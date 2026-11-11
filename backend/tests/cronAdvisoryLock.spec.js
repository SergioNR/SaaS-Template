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
const { runExclusiveCronTick, resetCronTransientFailureCounts } = await import('../server/cron/exclusiveCronTick.js');
const { markShuttingDown, resetProcessLifecycle } = await import('../server/utils/processLifecycle.js');
const { ADVISORY_LOCK_KEYS } = await import('../server/config/advisoryLockKeys.js');
const { prisma } = await import('../server/config/prismaClient.js');
const { logError, logInfo, logWarn } = await import('../server/config/loggerFunctions.js');

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

describe('runExclusiveCronTick - transient database errors', () => {
  const connectionRefused = () => Object.assign(new Error(''), { name: 'PrismaClientKnownRequestError', code: 'ECONNREFUSED' });
  const failNextLocks = (times) => {
    for (let index = 0; index < times; index++) {
      prisma.$transaction.mockRejectedValueOnce(connectionRefused());
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetCronTransientFailureCounts();
    tx.$queryRaw.mockResolvedValue([{ acquired: true }]);
  });

  it('warns on the first two consecutive failures and alerts exactly on the third', async () => {
    failNextLocks(2);
    await runExclusiveCronTick('sweep', 1, jest.fn());
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledTimes(2);
    expect(logWarn).toHaveBeenLastCalledWith(
      expect.stringContaining('sweep'),
      expect.any(Error),
      { jobName: 'sweep', code: 'ECONNREFUSED', consecutiveFailures: 2 },
    );

    failNextLocks(1);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining('sweep'),
      expect.any(Error),
      expect.objectContaining({ consecutiveFailures: 3 }),
    );

    //* A fourth failure keeps warning - one alert per outage
    failNextLocks(1);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledTimes(3);
  });

  it('resets the count after a successful tick', async () => {
    failNextLocks(2);
    await runExclusiveCronTick('sweep', 1, jest.fn());
    await runExclusiveCronTick('sweep', 1, jest.fn());

    await runExclusiveCronTick('sweep', 1, jest.fn().mockResolvedValue(undefined));

    failNextLocks(1);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenLastCalledWith(expect.any(String), expect.any(Error), expect.objectContaining({ consecutiveFailures: 1 }));
  });

  it('resets the count after a skipped tick (the lock query answered)', async () => {
    failNextLocks(2);
    await runExclusiveCronTick('sweep', 1, jest.fn());
    await runExclusiveCronTick('sweep', 1, jest.fn());

    tx.$queryRaw.mockResolvedValueOnce([{ acquired: false }]);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    failNextLocks(1);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).not.toHaveBeenCalled();
  });

  it('counts per job', async () => {
    failNextLocks(3);
    await runExclusiveCronTick('a', 1, jest.fn());
    await runExclusiveCronTick('a', 1, jest.fn());
    await runExclusiveCronTick('b', 2, jest.fn());

    expect(logError).not.toHaveBeenCalled();
  });

  it('reads the code from the error cause', async () => {
    prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('wrapped'), { cause: { code: 'ETIMEDOUT' } }));

    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.any(String), expect.any(Error), expect.objectContaining({ code: 'ETIMEDOUT' }));
  });

  it('alerts a non-transient error (e.g. the lock-hold timeout) on the first occurrence', async () => {
    failNextLocks(2);
    await runExclusiveCronTick('sweep', 1, jest.fn());
    await runExclusiveCronTick('sweep', 1, jest.fn());

    //* The 10-minute lock-hold ceiling (Prisma interactive transaction
    //* timeout) is not a connectivity error - it pages at once
    prisma.$transaction.mockRejectedValueOnce(Object.assign(new Error('Transaction already closed: timeout'), { code: 'P2028' }));
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('sweep'), expect.objectContaining({ code: 'P2028' }));

    //* ...and resets nothing: the next transient failure is the third
    failNextLocks(1);
    await runExclusiveCronTick('sweep', 1, jest.fn());

    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenLastCalledWith(expect.any(String), expect.any(Error), expect.objectContaining({ consecutiveFailures: 3 }));
  });
});

describe('runExclusiveCronTick - after shutdown started', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetCronTransientFailureCounts();
    tx.$queryRaw.mockResolvedValue([{ acquired: true }]);
  });

  afterEach(() => {
    resetProcessLifecycle();
  });

  it('downgrades a tick error to a warning once the shutdown started', async () => {
    markShuttingDown();

    await runExclusiveCronTick('sweep', 1, jest.fn().mockRejectedValue(new Error('Client was disconnected')));

    expect(logError).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('shutdown'), expect.any(Error), { jobName: 'sweep' });
  });
});

describe('ADVISORY_LOCK_KEYS', () => {
  it('gives every serialized operation its own key', () => {
    const keys = Object.values(ADVISORY_LOCK_KEYS);

    expect(new Set(keys).size).toBe(keys.length);
  });
});
