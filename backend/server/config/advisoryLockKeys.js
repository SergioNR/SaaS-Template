//* Postgres advisory lock keys (bigint) - one per serialized operation, all
//* in one place so two features can never share a key by accident
export const ADVISORY_LOCK_KEYS = {
  //* Last-superadmin check + delete (userModel.deleteUserWithCompanyDataInDb)
  superadminDeletion: 4815162342,
  //* Cron ticks - only one replica runs each job at a time
  cronPasswordResetTokens: 7300001,
  cronTeamInvites: 7300002,
  cronPendingFileUploads: 7300003,
  cronExpiredSessions: 7300004,
};
