import { CronJob } from 'cron';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { deleteExpiredPasswordResetTokens } from '../models/passwordResetTokensModel.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* waitForCompletion: a tick still running is never overlapped by the next
//* one; the advisory lock keeps other replicas from running it concurrently
export const deletePasswordResetTokensScheduler = CronJob.from({
  cronTime: '0 3 * * *',
  onTick: () => runExclusiveCronTick(
    'deleteExpiredPasswordResetTokens',
    ADVISORY_LOCK_KEYS.cronPasswordResetTokens,
    deleteExpiredPasswordResetTokens,
  ),
  waitForCompletion: true,
});
