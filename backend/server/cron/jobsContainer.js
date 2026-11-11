import { logError, logInfo } from '../config/loggerFunctions.js';
import { deletePasswordResetTokensScheduler } from './deletePasswordResetTokensScheduler.js';
import { deleteTeamInvitesScheduler } from './deleteTeamInvitesScheduler.js';
import { deletePendingFileUploadsScheduler } from './deletePendingFileUploadsScheduler.js';
import { deleteUnverifiedAccountsScheduler } from './deleteUnverifiedAccountsScheduler.js';

export const startCronJobs = () => {
  logInfo('Starting cron jobs');
  try {
    deletePasswordResetTokensScheduler.start();
    deleteTeamInvitesScheduler.start();
    deletePendingFileUploadsScheduler.start();
    deleteUnverifiedAccountsScheduler.start();
  } catch (error) {
    logError('error on startCronJobs', error);
  }
};

//* Called on graceful shutdown so no tick starts while resources are closing
export const stopCronJobs = () => {
  try {
    deletePasswordResetTokensScheduler.stop();
    deleteTeamInvitesScheduler.stop();
    deletePendingFileUploadsScheduler.stop();
    deleteUnverifiedAccountsScheduler.stop();
  } catch (error) {
    logError('error on stopCronJobs', error);
  }
};
