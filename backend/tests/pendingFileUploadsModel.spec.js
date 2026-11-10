import { jest } from '@jest/globals';

const fileFindMany = jest.fn();
const fileUpdateMany = jest.fn();
const fileDeleteMany = jest.fn();

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: { file: { findMany: fileFindMany, updateMany: fileUpdateMany, deleteMany: fileDeleteMany } },
}));

const {
  getStalePendingFilesInDb,
  markPendingFileCleanupFailedInDb,
  deletePendingFilesByKeysInDb,
} = await import('../server/models/pendingFileUploadsModel.js');

describe('pendingFileUploadsModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists stale pending rows with their cleanup-failure marker', async () => {
    const failedAt = new Date('2026-11-10T00:00:00.000Z');
    fileFindMany.mockResolvedValue([
      { s3_key: 'a', cleanup_failed_at: null },
      { s3_key: 'b', cleanup_failed_at: failedAt },
    ]);
    const cutoff = new Date('2026-11-11T00:00:00.000Z');

    await expect(getStalePendingFilesInDb(cutoff)).resolves.toEqual([
      { key: 'a', cleanupFailedAt: null },
      { key: 'b', cleanupFailedAt: failedAt },
    ]);
    expect(fileFindMany).toHaveBeenCalledWith({
      where: { status: 'pending', created_at: { lt: cutoff } },
      select: { s3_key: true, cleanup_failed_at: true },
    });
  });

  it('marks only unmarked pending rows of the failed keys', async () => {
    fileUpdateMany.mockResolvedValue({ count: 1 });
    const failedAt = new Date('2026-11-11T00:00:00.000Z');

    await expect(markPendingFileCleanupFailedInDb(['a', 'b'], failedAt)).resolves.toBe(1);
    expect(fileUpdateMany).toHaveBeenCalledWith({
      where: { status: 'pending', cleanup_failed_at: null, s3_key: { in: ['a', 'b'] } },
      data: { cleanup_failed_at: failedAt },
    });
  });

  it('skips the query when there is nothing to mark or delete', async () => {
    await expect(markPendingFileCleanupFailedInDb([])).resolves.toBe(0);
    await expect(deletePendingFilesByKeysInDb([])).resolves.toBe(0);

    expect(fileUpdateMany).not.toHaveBeenCalled();
    expect(fileDeleteMany).not.toHaveBeenCalled();
  });

  it('deletes only still-pending rows of the given keys', async () => {
    fileDeleteMany.mockResolvedValue({ count: 2 });

    await expect(deletePendingFilesByKeysInDb(['a', 'b'])).resolves.toBe(2);
    expect(fileDeleteMany).toHaveBeenCalledWith({ where: { status: 'pending', s3_key: { in: ['a', 'b'] } } });
  });
});
