import { CronJob } from 'cron';
import { logError, logInfo, logWarn } from '../config/loggerFunctions.js';
import { PENDING_FILE_MAX_AGE_MS } from '../config/pendingFileUploads.js';
import {
  deletePendingFilesByKeysInDb,
  getStalePendingFileKeysInDb,
} from '../models/pendingFileUploadsModel.js';
import { deleteS3Objects } from '../integrations/s3/deleteS3Objects.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* Keys whose bucket delete failed on the previous tick. A key that keeps
//* failing is retried every tick, so it alerts (logError, Telegram) only the
//* first time and is merely logged (logWarn) while it stays stuck
let previouslyFailedKeys = new Set();

const reportFailedKeys = (failedKeys, staleKeyCount) => {
  const failedKeySet = new Set(failedKeys);
  const hasNewFailures = failedKeys.some((key) => !previouslyFailedKeys.has(key));

  previouslyFailedKeys = failedKeySet;

  if (failedKeys.length === 0) {
    return failedKeySet;
  }

  const message = `Could not delete ${failedKeys.length} of ${staleKeyCount} stale pending upload object(s) from the bucket - their rows are kept for the next run`;

  if (hasNewFailures) {
    logError(message, new Error('S3 batch delete reported failed keys'), { failedKeys });
  } else {
    logWarn(`${message} (same keys as the previous run)`, new Error('S3 batch delete reported failed keys'), { failedKeys });
  }

  return failedKeySet;
};

//* Bucket first, catalog second: a row is only dropped once its object is
//* confirmed gone, so a failed bucket delete keeps the row and the next tick
//* retries it instead of silently orphaning the object. The listing uses the
//* full PENDING_FILE_MAX_AGE_MS while confirm refuses rows older than
//* PENDING_FILE_CONFIRM_MAX_AGE_MS (a safety margin earlier), so no row this
//* job touches can be flipped to `ready` between the bucket delete and the
//* row delete - which is additionally filtered on `pending`
export const deletePendingFileUploads = async () => {
  const staleKeys = await getStalePendingFileKeysInDb(new Date(Date.now() - PENDING_FILE_MAX_AGE_MS));

  if (staleKeys.length === 0) {
    reportFailedKeys([], 0);

    return;
  }

  const { failedKeys } = await deleteS3Objects(staleKeys);

  const failedKeySet = reportFailedKeys(failedKeys, staleKeys.length);

  const deletedKeys = staleKeys.filter((key) => !failedKeySet.has(key));

  const deletedRowCount = await deletePendingFilesByKeysInDb(deletedKeys);

  logInfo(`Deleted ${deletedRowCount} stale pending file upload(s)`);
};

//* waitForCompletion: an in-flight tick (slow bucket delete) is never
//* overlapped by the next one, and the advisory lock keeps other replicas
//* from running it concurrently, so two runs cannot race on the same keys
export const deletePendingFileUploadsScheduler = CronJob.from({
  cronTime: '*/15 * * * *',
  onTick: () => runExclusiveCronTick(
    'deletePendingFileUploads',
    ADVISORY_LOCK_KEYS.cronPendingFileUploads,
    deletePendingFileUploads,
  ),
  waitForCompletion: true,
});
