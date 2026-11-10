import { logError, logInfo } from '../config/loggerFunctions.js';
import { deletePasswordResetTokensScheduler } from './deletePasswordResetTokensScheduler.js';
import { deleteTeamInvitesScheduler } from './deleteTeamInvitesScheduler.js';
import { deletePendingFileUploadsScheduler } from './deletePendingFileUploadsScheduler.js';

export const startCronJobs = () => {
  logInfo('Starting cron jobs');
  try {
    deletePasswordResetTokensScheduler.start();
    deleteTeamInvitesScheduler.start();
    deletePendingFileUploadsScheduler.start();
  } catch (error) {
    logError('error on startCronJobs', error);
  }
};

//* Called on graceful shutdown so no tick starts while resources are closing.
//* Every job runs with waitForCompletion, so stop() clears its timer at once
//* and returns a promise that settles when the running tick (if any)
//* finished - the shutdown awaits these before closing the database
export const stopCronJobs = () => {
  try {
    return Promise.allSettled([
      deletePasswordResetTokensScheduler.stop(),
      deleteTeamInvitesScheduler.stop(),
      deletePendingFileUploadsScheduler.stop(),
    ]);
  } catch (error) {
    logError('error on stopCronJobs', error);
    return Promise.resolve([]);
  }
};
