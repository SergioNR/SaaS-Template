import { jest } from '@jest/globals';

//* CronJob.from is captured instead of scheduled - the specs inspect the job
//* configuration and run its tick by hand
jest.unstable_mockModule('cron', () => ({
  CronJob: {
    from: jest.fn((config) => ({ config })),
  },
}));

jest.unstable_mockModule('../server/cron/exclusiveCronTick.js', () => ({
  runExclusiveCronTick: jest.fn().mockResolvedValue(undefined),
}));

const passwordResetTokensDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const teamInvitesDeleteMany = jest.fn().mockResolvedValue({ count: 0 });
const sessionsDeleteMany = jest.fn().mockResolvedValue({ count: 0 });

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    passwordResetTokens: { deleteMany: passwordResetTokensDeleteMany },
    teamInvites: { deleteMany: teamInvitesDeleteMany },
    session: { deleteMany: sessionsDeleteMany },
  },
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const { deletePasswordResetTokensScheduler } = await import('../server/cron/deletePasswordResetTokensScheduler.js');
const { deleteTeamInvitesScheduler } = await import('../server/cron/deleteTeamInvitesScheduler.js');
const { deleteExpiredSessionsScheduler, deleteExpiredSessions } = await import('../server/cron/deleteExpiredSessionsScheduler.js');
const { runExclusiveCronTick } = await import('../server/cron/exclusiveCronTick.js');
const { ADVISORY_LOCK_KEYS } = await import('../server/config/advisoryLockKeys.js');
const { logInfo } = await import('../server/config/loggerFunctions.js');
const { deleteExpiredPasswordResetTokens } = await import('../server/models/passwordResetTokensModel.js');
const { deleteExpiredTeamInvites } = await import('../server/models/teamInvitesModel.js');

describe.each([
  ['deletePasswordResetTokensScheduler', () => deletePasswordResetTokensScheduler, '0 3 * * *', 'deleteExpiredPasswordResetTokens', 'cronPasswordResetTokens', () => deleteExpiredPasswordResetTokens],
  ['deleteTeamInvitesScheduler', () => deleteTeamInvitesScheduler, '15 3 * * *', 'deleteExpiredTeamInvites', 'cronTeamInvites', () => deleteExpiredTeamInvites],
  ['deleteExpiredSessionsScheduler', () => deleteExpiredSessionsScheduler, '7-59/15 * * * *', 'deleteExpiredSessions', 'cronExpiredSessions', () => deleteExpiredSessions],
])('%s', (_name, getJob, cronTime, jobName, lockKeyName, getTask) => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it(`runs at "${cronTime}" and never overlaps itself`, () => {
    const { config } = getJob();

    expect(config.cronTime).toBe(cronTime);
    expect(config.waitForCompletion).toBe(true);
  });

  it('runs its tick through the advisory-lock wrapper with its own key', async () => {
    const { config } = getJob();

    await config.onTick();

    expect(ADVISORY_LOCK_KEYS[lockKeyName]).toBeDefined();
    expect(runExclusiveCronTick).toHaveBeenCalledWith(jobName, ADVISORY_LOCK_KEYS[lockKeyName], getTask());
  });
});

describe('expired-row cleanup models', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    ['password reset tokens', () => deleteExpiredPasswordResetTokens(), passwordResetTokensDeleteMany],
    ['team invites', () => deleteExpiredTeamInvites(), teamInvitesDeleteMany],
  ])('deletes only %s whose expiry is in the past', async (_label, cleanup, deleteMany) => {
    const before = Date.now();

    await cleanup();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const [{ where }] = deleteMany.mock.calls[0];
    expect(Object.keys(where)).toEqual(['token_expires']);
    expect(where.token_expires.lt).toBeInstanceOf(Date);
    expect(where.token_expires.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(where.token_expires.lt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('propagates database errors so runExclusiveCronTick can log them', async () => {
    teamInvitesDeleteMany.mockRejectedValueOnce(new Error('db down'));

    await expect(deleteExpiredTeamInvites()).rejects.toThrow('db down');
  });
});

describe('deleteExpiredSessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes expired session rows and logs the count', async () => {
    sessionsDeleteMany.mockResolvedValueOnce({ count: 3 });
    const before = Date.now();

    await deleteExpiredSessions();

    const [{ where }] = sessionsDeleteMany.mock.calls[0];
    expect(Object.keys(where)).toEqual(['expiresAt']);
    expect(where.expiresAt.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(logInfo).toHaveBeenCalledWith('Deleted 3 expired session(s)');
  });

  it('runs off the quarter-hour so it never starts with the upload sweep', () => {
    expect(deleteExpiredSessionsScheduler.config.cronTime).not.toBe('*/15 * * * *');
  });
});
