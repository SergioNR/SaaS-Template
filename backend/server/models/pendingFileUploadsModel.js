import { prisma } from '../config/prismaClient.js';

//* Upload rows that never got confirmed - the cleanup job removes the bucket
//* objects first and only then deletes the rows (see
//* cron/deletePendingFileUploadsScheduler.js). `cleanupFailedAt` is the
//* shared failure memory: non-null once a previous sweep (on any replica)
//* failed to delete the row's object
export const getStalePendingFilesInDb = async (createdBefore) => {
  const staleFiles = await prisma.file.findMany({
    where: {
      status: 'pending',
      created_at: {
        lt: createdBefore,
      },
    },
    select: {
      s3_key: true,
      cleanup_failed_at: true,
    },
  });

  return staleFiles.map((file) => ({
    key: file.s3_key,
    cleanupFailedAt: file.cleanup_failed_at,
  }));
};

//* Marks rows whose bucket delete failed. Only rows without a marker are
//* touched (the first failure time is kept) and only while still pending.
//* Runs inside the sweep tick, which holds the job's advisory lock, so no
//* other replica races on the same rows. Resolves to the number of rows marked
export const markPendingFileCleanupFailedInDb = async (s3Keys, failedAt = new Date()) => {
  if (s3Keys.length === 0) {
    return 0;
  }

  const updateResult = await prisma.file.updateMany({
    where: {
      status: 'pending',
      cleanup_failed_at: null,
      s3_key: {
        in: s3Keys,
      },
    },
    data: {
      cleanup_failed_at: failedAt,
    },
  });

  return updateResult.count;
};

//* Still filtered on `pending` so a row confirmed between the key listing and
//* this delete is left alone. Resolves to the number of deleted rows
export const deletePendingFilesByKeysInDb = async (s3Keys) => {
  if (s3Keys.length === 0) {
    return 0;
  }

  const deleteResult = await prisma.file.deleteMany({
    where: {
      status: 'pending',
      s3_key: {
        in: s3Keys,
      },
    },
  });

  return deleteResult.count;
};
