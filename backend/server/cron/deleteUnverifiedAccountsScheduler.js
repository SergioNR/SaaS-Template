import { CronJob } from 'cron';
import { logError, logInfo } from '../config/loggerFunctions.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { getUnverifiedUserIdsRegisteredBeforeInDb } from '../models/userModel.js';
import { deleteExpiredEmailVerificationTokensInDb } from '../models/emailVerificationTokensModel.js';
import { deleteUserAndCleanup } from '../utils/userDeletionCleanup.js';
import { isTransientDatabaseError } from '../utils/prismaErrors.js';
import { isShuttingDown } from '../utils/processLifecycle.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* Must exceed the 24 h verification token lifetime so a registrant always
//* gets the whole link window (plus resends) before the address is freed
export const UNVERIFIED_ACCOUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

//* Abandoned or squatted registrations free their address: every account still
//* unverified 7 days after registration is deleted with its company data (the
//* shared deletion path - one locked transaction each, Stripe/S3 after the
//* commit), then expired verification tokens are purged. Each deletion
//* re-checks the verification state under a row lock (onlyIfUnverified), so
//* an account verified meanwhile is kept. One failed account is logged and
//* never stops the others
export const deleteUnverifiedAccounts = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - UNVERIFIED_ACCOUNT_MAX_AGE_MS);
  const userIds = await getUnverifiedUserIdsRegisteredBeforeInDb(cutoff);

  let deletedCount = 0;

  for (const userId of userIds) {
    try {
      const result = await deleteUserAndCleanup(userId, { onlyIfUnverified: true, actorKind: 'system' });

      if (result.status === 'deleted') {
        deletedCount += 1;
      }
    } catch (error) {
      //* A database outage or a shutdown fails every remaining account the
      //* same way - rethrown so runExclusiveCronTick applies its warn-first
      //* rules instead of one alert per account
      if (isTransientDatabaseError(error) || isShuttingDown()) {
        throw error;
      }

      logError(`Could not purge unverified account ${userId}`, error);
    }
  }

  const deletedTokenCount = await deleteExpiredEmailVerificationTokensInDb();

  logInfo(`Purged ${deletedCount} unverified account(s) and ${deletedTokenCount} expired email verification token(s)`);

  return { deletedCount, deletedTokenCount };
};

//* 03:45 - staggered after the 03:00 reset-token, 03:15 invite and 03:30 rate-limit-hit cleanups.
//* waitForCompletion: a tick still running is never overlapped by the next
//* one; the advisory lock keeps other replicas from running it concurrently
export const deleteUnverifiedAccountsScheduler = CronJob.from({
  cronTime: '45 3 * * *',
  onTick: () => runExclusiveCronTick(
    'deleteUnverifiedAccounts',
    ADVISORY_LOCK_KEYS.cronUnverifiedAccounts,
    deleteUnverifiedAccounts,
  ),
  waitForCompletion: true,
});
