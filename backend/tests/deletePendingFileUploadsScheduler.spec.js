import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/pendingFileUploadsModel.js', () => ({
  getStalePendingFilesInDb: jest.fn(),
  markPendingFileCleanupFailedInDb: jest.fn(),
  deletePendingFilesByKeysInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/s3/deleteS3Objects.js', () => ({
  deleteS3Objects: jest.fn(),
}));

jest.unstable_mockModule('../server/models/advisoryLockModel.js', () => ({
  runWithAdvisoryLockInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const schedulerModulePath = '../server/cron/deletePendingFileUploadsScheduler.js';
const { deletePendingFileUploads } = await import(schedulerModulePath);
const {
  PENDING_FILE_CONFIRM_MAX_AGE_MS,
  PENDING_FILE_MAX_AGE_MS,
} = await import('../server/config/pendingFileUploads.js');
const {
  getStalePendingFilesInDb,
  markPendingFileCleanupFailedInDb,
  deletePendingFilesByKeysInDb,
} = await import('../server/models/pendingFileUploadsModel.js');
const { deleteS3Objects } = await import('../server/integrations/s3/deleteS3Objects.js');
const { logError, logWarn } = await import('../server/config/loggerFunctions.js');

const KEY_A = 'company-1/file-1/a.pdf';
const KEY_B = 'company-1/file-2/b.pdf';

//* An in-memory stand-in for the pending File rows - the database is the
//* shared state every replica sees, so the fake keeps it outside the module
let rows;

const seedRows = (...keys) => {
  rows = new Map(keys.map((key) => [key, { cleanupFailedAt: null }]));
};

describe('deletePendingFileUploads', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    seedRows();

    getStalePendingFilesInDb.mockImplementation(async () => [...rows].map(([key, row]) => ({ key, cleanupFailedAt: row.cleanupFailedAt })));
    markPendingFileCleanupFailedInDb.mockImplementation(async (keys) => {
      keys.forEach((key) => {
        const row = rows.get(key);
        if (row && row.cleanupFailedAt === null) row.cleanupFailedAt = new Date();
      });
    });
    deletePendingFilesByKeysInDb.mockImplementation(async (keys) => {
      keys.forEach((key) => rows.delete(key));
      return keys.length;
    });
    deleteS3Objects.mockResolvedValue({ deletedCount: 0, failedKeys: [] });
  });

  it('only lists rows the confirm endpoint can no longer flip to ready', () => {
    expect(PENDING_FILE_MAX_AGE_MS).toBe(3600000);
    expect(PENDING_FILE_CONFIRM_MAX_AGE_MS).toBeLessThan(PENDING_FILE_MAX_AGE_MS);
    //* Margin for a confirm in flight when its row crosses the confirm window
    expect(PENDING_FILE_MAX_AGE_MS - PENDING_FILE_CONFIRM_MAX_AGE_MS).toBeGreaterThanOrEqual(5 * 60 * 1000);
  });

  it('lists pending rows older than one hour, deletes their objects, then the rows', async () => {
    seedRows(KEY_A);
    deleteS3Objects.mockResolvedValue({ deletedCount: 1, failedKeys: [] });
    const before = Date.now();

    await deletePendingFileUploads();

    const [cutoff] = getStalePendingFilesInDb.mock.calls[0];
    expect(cutoff.getTime()).toBeLessThanOrEqual(before - PENDING_FILE_MAX_AGE_MS + 1000);
    expect(deleteS3Objects).toHaveBeenCalledWith([KEY_A]);
    expect(deletePendingFilesByKeysInDb).toHaveBeenCalledWith([KEY_A]);
    expect(deleteS3Objects.mock.invocationCallOrder[0]).toBeLessThan(deletePendingFilesByKeysInDb.mock.invocationCallOrder[0]);
    expect(markPendingFileCleanupFailedInDb).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('keeps and marks the rows whose objects could not be deleted and alerts with the keys', async () => {
    seedRows(KEY_A, KEY_B);
    deleteS3Objects.mockResolvedValue({ deletedCount: 1, failedKeys: [KEY_B] });

    await deletePendingFileUploads();

    expect(deletePendingFilesByKeysInDb).toHaveBeenCalledWith([KEY_A]);
    expect(markPendingFileCleanupFailedInDb).toHaveBeenCalledWith([KEY_B]);
    expect(rows.get(KEY_B).cleanupFailedAt).toBeInstanceOf(Date);
    expect(logError).toHaveBeenCalledTimes(1);
    const [message, , additionalInfo] = logError.mock.calls[0];
    expect(message).toContain('1 of 2');
    expect(additionalInfo).toEqual({ failedKeys: [KEY_B] });
  });

  it('alerts only once while the same keys keep failing, and again when a new key fails', async () => {
    seedRows(KEY_A, KEY_B);
    deleteS3Objects.mockResolvedValue({ deletedCount: 0, failedKeys: [KEY_B] });

    await deletePendingFileUploads();
    await deletePendingFileUploads();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logWarn.mock.calls[0][2]).toEqual({ failedKeys: [KEY_B] });

    //* KEY_A was deleted on the first tick - a fresh row for a new key fails
    rows.set(KEY_A, { cleanupFailedAt: null });
    deleteS3Objects.mockResolvedValue({ deletedCount: 0, failedKeys: [KEY_A, KEY_B] });
    await deletePendingFileUploads();

    expect(logError).toHaveBeenCalledTimes(2);
  });

  it('only warns for keys an earlier run already marked, even in a freshly loaded module (another replica or a restart)', async () => {
    seedRows(KEY_B);
    deleteS3Objects.mockResolvedValue({ deletedCount: 0, failedKeys: [KEY_B] });
    await deletePendingFileUploads();
    expect(logError).toHaveBeenCalledTimes(1);

    const { deletePendingFileUploads: otherReplicaSweep } = await import(`${schedulerModulePath}?replica=b`);

    await otherReplicaSweep();

    expect(logError).toHaveBeenCalledTimes(1);
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it('skips the bucket and the rows when nothing is stale', async () => {
    await deletePendingFileUploads();

    expect(deleteS3Objects).not.toHaveBeenCalled();
    expect(deletePendingFilesByKeysInDb).not.toHaveBeenCalled();
  });
});
