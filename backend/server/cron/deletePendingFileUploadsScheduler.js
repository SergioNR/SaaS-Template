import { CronJob } from 'cron';
import { logError, logInfo, logWarn } from '../config/loggerFunctions.js';
import { PENDING_FILE_MAX_AGE_MS } from '../config/pendingFileUploads.js';
import {
  deletePendingFilesByKeysInDb,
  getStalePendingFilesInDb,
  markPendingFileCleanupFailedInDb,
} from '../models/pendingFileUploadsModel.js';
import { deleteS3Objects } from '../integrations/s3/deleteS3Objects.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* A key that keeps failing is retried every tick, so it alerts (logError,
//* Telegram) only the first time and is merely logged (logWarn) while it
//* stays stuck. The "already failed" memory is the row's cleanup_failed_at
//* marker - shared by every replica (whichever wins the lock runs the sweep)
//* and kept across restarts, unlike module state
const reportFailedKeys = async (failedKeys, staleFiles) => {
  if (failedKeys.length === 0) {
    return;
  }

  const failedKeySet = new Set(failedKeys);
  const hasNewFailures = staleFiles.some((file) => failedKeySet.has(file.key) && file.cleanupFailedAt === null);

  const message = `Could not delete ${failedKeys.length} of ${staleFiles.length} stale pending upload object(s) from the bucket - their rows are kept for the next run`;

  if (hasNewFailures) {
    logError(message, new Error('S3 batch delete reported failed keys'), { failedKeys });
  } else {
    logWarn(`${message} (all of them already failed on an earlier run)`, new Error('S3 batch delete reported failed keys'), { failedKeys });
  }

  //* Marked after the log line: if the marker write fails the tick errors
  //* and the next run alerts again - erring towards one alert too many
  await markPendingFileCleanupFailedInDb(failedKeys);
};

//* Bucket first, catalog second: a row is only dropped once its object is
//* confirmed gone, so a failed bucket delete keeps the row and the next tick
//* retries it instead of silently orphaning the object. The listing uses the
//* full PENDING_FILE_MAX_AGE_MS while confirm refuses rows older than
//* PENDING_FILE_CONFIRM_MAX_AGE_MS (a safety margin earlier), so no row this
//* job touches can be flipped to `ready` between the bucket delete and the
//* row delete - which is additionally filtered on `pending`
export const deletePendingFileUploads = async () => {
  const staleFiles = await getStalePendingFilesInDb(new Date(Date.now() - PENDING_FILE_MAX_AGE_MS));

  if (staleFiles.length === 0) {
    return;
  }

  const staleKeys = staleFiles.map((file) => file.key);

  const { failedKeys } = await deleteS3Objects(staleKeys);

  await reportFailedKeys(failedKeys, staleFiles);

  const failedKeySet = new Set(failedKeys);
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
