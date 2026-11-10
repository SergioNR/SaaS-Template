import { logError, logInfo } from '../config/loggerFunctions.js';
import { runWithAdvisoryLockInDb } from '../models/advisoryLockModel.js';

//* Every replica schedules the same jobs - the advisory lock makes exactly
//* one of them run each tick (the others skip it). Never throws: errors are
//* logError-ed like any other cron failure
export const runExclusiveCronTick = async (jobName, lockKey, task) => {
  try {
    const { acquired } = await runWithAdvisoryLockInDb(lockKey, task);

    if (!acquired) {
      logInfo(`Cron job ${jobName} skipped - another replica holds its lock`);
    }
  } catch (error) {
    logError(`Error in cron job ${jobName}:`, error);
  }
};
