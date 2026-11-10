import { prisma } from '../config/prismaClient.js';
import { listPaginationArgs } from '../utils/cursorPagination.js';

export const createFileInDb = async (fileData) => {
  const {
    id,
    companyId,
    uploadedBy,
    s3Key,
    originalFilename,
    mimeType,
    sizeBytes,
  } = fileData;

  const createFileQuery = await prisma.file.create({
    data: {
      id,
      company_id: companyId,
      uploaded_by: uploadedBy,
      s3_key: s3Key,
      original_filename: originalFilename,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    },
  });

  return createFileQuery;
};

//* Only verified uploads are listed - pending rows are invisible until the
//* confirm endpoint checked the stored object
export const getFilesInDb = async (companyId, pagination = {}) => {
  const getFilesQuery = await prisma.file.findMany({
    where: {
      company_id: companyId,
      status: 'ready',
    },
    //* Newest first with the id tiebreaker - the order the cursor walk relies on
    ...listPaginationArgs(pagination),
  });

  return getFilesQuery;
};

//* Scoped by company so one company can never act on another's files.
//* `status` optionally narrows the lookup (e.g. downloads only see ready files)
export const getFileByIdInDb = async (fileId, companyId, status = undefined) => {
  const getFileByIdQuery = await prisma.file.findFirst({
    where: {
      id: fileId,
      company_id: companyId,
      ...(status ? { status } : {}),
    },
  });

  return getFileByIdQuery;
};

//* Company-scoped conditional delete - resolves to false when the row did not
//* exist (or belonged to another company), so callers can answer 404 instead
//* of touching the bucket for a file they do not own
export const deleteFileInDb = async (fileId, companyId) => {
  const deleteResult = await prisma.file.deleteMany({
    where: {
      id: fileId,
      company_id: companyId,
    },
  });

  return deleteResult.count > 0;
};

//* Unconfirmed uploads of a company - bounds the number of presigned URLs a
//* company can hold open at once (see MAX_PENDING_UPLOADS_PER_COMPANY)
export const countPendingFilesInDb = async (companyId) => {
  const pendingCount = await prisma.file.count({
    where: {
      company_id: companyId,
      status: 'pending',
    },
  });

  return pendingCount;
};

//* Conditional transition so a row the cleanup job removed concurrently is
//* never resurrected, and a row old enough for the cleanup job to be deleting
//* its object right now (created at or before `createdAfter`) is never
//* flipped to ready. Returns the updated row, or null when no pending row
//* young enough matched
export const markFileReadyInDb = async (fileId, createdAfter) => {
  const updateResult = await prisma.file.updateMany({
    where: {
      id: fileId,
      status: 'pending',
      created_at: {
        gt: createdAfter,
      },
    },
    data: {
      status: 'ready',
    },
  });

  if (updateResult.count !== 1) {
    return null;
  }

  return prisma.file.findUnique({
    where: {
      id: fileId,
    },
  });
};
