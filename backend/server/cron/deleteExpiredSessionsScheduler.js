import { CronJob } from 'cron';
import { logInfo } from '../config/loggerFunctions.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { deleteExpiredSessionsInDb } from '../models/sessionModel.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* Replaces the session store's per-replica prune interval (checkPeriod is
//* off in middlewares/storeExpressSessions.js). Pruning is storage hygiene
//* only - an expired session is refused on read anyway - so every 15 minutes
//* is plenty
export const deleteExpiredSessions = async () => {
  const deletedCount = await deleteExpiredSessionsInDb();

  logInfo(`Deleted ${deletedCount} expired session(s)`);
};

//* Minutes 7, 22, 37, 52 - offset from the */15 upload sweep and the nightly
//* 03:00 / 03:15 jobs so they never hit the database at the same moment.
//* waitForCompletion: a tick still running is never overlapped by the next
//* one; the advisory lock keeps other replicas from running it concurrently
export const deleteExpiredSessionsScheduler = CronJob.from({
  cronTime: '7-59/15 * * * *',
  onTick: () => runExclusiveCronTick(
    'deleteExpiredSessions',
    ADVISORY_LOCK_KEYS.cronExpiredSessions,
    deleteExpiredSessions,
  ),
  waitForCompletion: true,
});
