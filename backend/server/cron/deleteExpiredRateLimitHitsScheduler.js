import { CronJob } from 'cron';
import { logInfo } from '../config/loggerFunctions.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { resolveRateLimitStoreKind } from '../config/rateLimitStore.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* Bounds the shared rate-limit table (RATE_LIMIT_STORE=postgres). With the
//* memory store the table stays empty, so the tick does nothing. The model
//* is loaded lazily for the same reason as in config/rateLimitStore.js
export const deleteExpiredRateLimitHits = async () => {
  if (resolveRateLimitStoreKind() !== 'postgres') {
    return;
  }

  const { deleteExpiredRateLimitHitsInDb } = await import('../models/rateLimitModel.js');
  const deletedCount = await deleteExpiredRateLimitHitsInDb();

  logInfo(`Deleted ${deletedCount} expired rate-limit counter(s)`);
};

//* 03:30 - staggered from the 03:00 / 03:15 nightly cleanups.
//* waitForCompletion: a tick still running is never overlapped by the next
//* one; the advisory lock keeps other replicas from running it concurrently
export const deleteExpiredRateLimitHitsScheduler = CronJob.from({
  cronTime: '30 3 * * *',
  onTick: () => runExclusiveCronTick(
    'deleteExpiredRateLimitHits',
    ADVISORY_LOCK_KEYS.cronExpiredRateLimitHits,
    deleteExpiredRateLimitHits,
  ),
  waitForCompletion: true,
});
