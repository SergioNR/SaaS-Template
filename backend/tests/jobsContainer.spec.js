import { jest } from '@jest/globals';

//* The schedulers are replaced by stubs - the container's contract is only
//* "start every job" and "stop every job, returning the running ticks' drain"
const schedulerStub = () => ({ start: jest.fn(), stop: jest.fn().mockResolvedValue(undefined) });

const schedulers = {
  deletePasswordResetTokensScheduler: schedulerStub(),
  deleteTeamInvitesScheduler: schedulerStub(),
  deletePendingFileUploadsScheduler: schedulerStub(),
  deleteExpiredSessionsScheduler: schedulerStub(),
  deleteExpiredRateLimitHitsScheduler: schedulerStub(),
};

jest.unstable_mockModule('../server/cron/deletePasswordResetTokensScheduler.js', () => ({
  deletePasswordResetTokensScheduler: schedulers.deletePasswordResetTokensScheduler,
}));
jest.unstable_mockModule('../server/cron/deleteTeamInvitesScheduler.js', () => ({
  deleteTeamInvitesScheduler: schedulers.deleteTeamInvitesScheduler,
}));
jest.unstable_mockModule('../server/cron/deletePendingFileUploadsScheduler.js', () => ({
  deletePendingFileUploadsScheduler: schedulers.deletePendingFileUploadsScheduler,
}));
jest.unstable_mockModule('../server/cron/deleteExpiredSessionsScheduler.js', () => ({
  deleteExpiredSessionsScheduler: schedulers.deleteExpiredSessionsScheduler,
}));

jest.unstable_mockModule('../server/cron/deleteExpiredRateLimitHitsScheduler.js', () => ({
  deleteExpiredRateLimitHitsScheduler: schedulers.deleteExpiredRateLimitHitsScheduler,
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const { startCronJobs, stopCronJobs } = await import('../server/cron/jobsContainer.js');

const deferred = () => {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
};

describe('jobsContainer', () => {
  beforeEach(() => {
    Object.values(schedulers).forEach((scheduler) => {
      scheduler.start.mockClear();
      scheduler.stop.mockReset().mockResolvedValue(undefined);
    });
  });

  it('starts every job', () => {
    startCronJobs();

    Object.values(schedulers).forEach((scheduler) => expect(scheduler.start).toHaveBeenCalledTimes(1));
  });

  it('stops every job synchronously and settles only once every running tick finished', async () => {
    const runningTick = deferred();
    schedulers.deletePendingFileUploadsScheduler.stop.mockReturnValue(runningTick.promise);

    let settled = false;
    const drain = stopCronJobs().then((results) => {
      settled = true;
      return results;
    });

    Object.values(schedulers).forEach((scheduler) => expect(scheduler.stop).toHaveBeenCalledTimes(1));

    await new Promise((resolve) => { setImmediate(resolve); });
    expect(settled).toBe(false);

    runningTick.resolve();
    const results = await drain;

    expect(results).toHaveLength(Object.keys(schedulers).length);
  });

  it('still settles when a job stop rejects', async () => {
    schedulers.deleteTeamInvitesScheduler.stop.mockRejectedValue(new Error('onComplete failed'));

    const results = await stopCronJobs();

    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled']);
  });
});
