import { CronJob } from 'cron';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { deleteExpiredTeamInvites } from '../models/teamInvitesModel.js';
import { runExclusiveCronTick } from './exclusiveCronTick.js';

//* 03:15 - staggered from the 03:00 reset-token cleanup so the nightly jobs
//* do not hit the database at the same moment.
//* waitForCompletion: a tick still running is never overlapped by the next
//* one; the advisory lock keeps other replicas from running it concurrently
export const deleteTeamInvitesScheduler = CronJob.from({
  cronTime: '15 3 * * *',
  onTick: () => runExclusiveCronTick(
    'deleteExpiredTeamInvites',
    ADVISORY_LOCK_KEYS.cronTeamInvites,
    deleteExpiredTeamInvites,
  ),
  waitForCompletion: true,
});
