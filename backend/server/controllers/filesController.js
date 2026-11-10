import { randomUUID } from 'node:crypto';
import {
  countPendingFilesInDb,
  createFileInDb,
  deleteFileInDb,
  getFileByIdInDb,
  getFilesInDb,
  markFileReadyInDb,
} from '../models/filesModel.js';
import { presignPutObject } from '../integrations/s3/presignPutObject.js';
import { headS3Object } from '../integrations/s3/headS3Object.js';
import { presignGetObject } from '../integrations/s3/presignGetObject.js';
import { deleteS3Objects } from '../integrations/s3/deleteS3Objects.js';
import { buildFileS3Key, sanitizeFilename } from '../utils/s3Key.js';
import { MAX_PENDING_UPLOADS_PER_COMPANY } from '../config/s3.js';
import { PENDING_FILE_CONFIRM_MAX_AGE_MS } from '../config/pendingFileUploads.js';
import { logAudit, logWarn } from '../config/loggerFunctions.js';

//* The catalog row is the source of truth and is already gone when this runs:
//* an orphaned object is harmless and reclaimable, a dangling row is not, so a
//* failed object delete is logged and never turns the finished delete into a 500
const deleteS3ObjectBestEffort = async (s3Key) => {
  const { failedKeys } = await deleteS3Objects([s3Key]);

  if (failedKeys.length > 0) {
    logWarn(`Bucket object ${s3Key} could not be deleted after its catalog row was removed`, new Error('S3 delete failed'));
  }
};

const uploadExpiredResponse = (res) => res.status(409).json({
  message: 'The upload is too old to be confirmed - upload the file again',
  code: 'FILE_UPLOAD_EXPIRED',
});

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

const parsePagination = (query) => ({
  limit: Math.min(Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  cursor: typeof query.cursor === 'string' && query.cursor.length > 0
    ? query.cursor
    : undefined,
});

const toFileShape = (file) => ({
  id: file.id,
  original_filename: file.original_filename,
  mime_type: file.mime_type,
  size_bytes: file.size_bytes,
  status: file.status,
  uploaded_by: file.uploaded_by,
  created_at: file.created_at,
});

export const createFileUpload = async (req, res) => {
  const { company_id: companyId, id: userId } = req.user;
  const { filename, contentType, sizeBytes } = req.body;

  //* Bounds the presigned URLs a company can hold open; the count and the
  //* insert are not atomic, so a burst can overshoot by a few - the cap is a
  //* brake on abuse, not an exact quota
  const pendingUploadCount = await countPendingFilesInDb(companyId);

  if (pendingUploadCount >= MAX_PENDING_UPLOADS_PER_COMPANY) {
    return res.status(409).json({
      message: `Too many unconfirmed uploads - confirm or wait for the cleanup of pending uploads (limit ${MAX_PENDING_UPLOADS_PER_COMPANY})`,
      code: 'FILE_PENDING_UPLOAD_LIMIT',
    });
  }

  const fileId = randomUUID();
  const sanitizedFilename = sanitizeFilename(filename);
  const s3Key = buildFileS3Key(companyId, fileId, filename);

  //* Presigning happens before the row insert so an S3 outage never leaves a
  //* catalog entry whose upload URL was never handed out
  const uploadUrl = await presignPutObject(s3Key, contentType, sizeBytes);

  const file = await createFileInDb({
    id: fileId,
    companyId,
    uploadedBy: userId,
    s3Key,
    originalFilename: sanitizedFilename,
    mimeType: contentType,
    sizeBytes,
  }); //* Starts as pending - only listed once confirmed

  logAudit(req, 'file.upload.created', { entity: 'file', entityId: file.id });

  return res.status(201).json({
    file: toFileShape(file),
    uploadUrl,
  });
};

//* The client calls this once its PUT to the presigned URL finished. The
//* stored object is checked against the declared size and MIME type before
//* the row becomes visible; a mismatching object is discarded together with
//* its row so a different payload can never sneak in under signed metadata
export const confirmFileUpload = async (req, res) => {
  const { fileId } = req.params;

  const { company_id: companyId, id: callerId } = req.user;

  const file = await getFileByIdInDb(fileId, companyId);

  if (!file) {
    return res.status(404).json({
      message: 'File does not exist',
    });
  }

  if (file.status === 'ready') {
    //* Idempotent - a retried confirm returns the same result
    return res.status(200).json({
      file: toFileShape(file),
    });
  }

  //* Only the uploader holds the presigned URL, so only they can confirm (and
  //* by that publish) a pending upload - another member must not flip, or
  //* trigger the mismatch-discard of, someone else's in-flight upload.
  //* Answered like a missing file so pending uploads of others stay invisible
  if (file.uploaded_by !== callerId) {
    return res.status(404).json({
      message: 'File does not exist',
    });
  }

  //* Rows past the confirm window may already be losing their object to the
  //* cleanup job (see config/pendingFileUploads.js) - fast path, the
  //* conditional update below is the real guard
  const confirmableAfter = new Date(Date.now() - PENDING_FILE_CONFIRM_MAX_AGE_MS);

  if (new Date(file.created_at) <= confirmableAfter) {
    return uploadExpiredResponse(res);
  }

  const storedObject = await headS3Object(file.s3_key);

  if (!storedObject) {
    //* Upload not finished (or never started) - the row stays pending so the
    //* client can retry; the cleanup job removes it after an hour
    return res.status(409).json({
      message: 'The uploaded object was not found - upload the file before confirming',
      code: 'FILE_UPLOAD_MISSING',
    });
  }

  const sizeMatches = Number(storedObject.contentLength) === file.size_bytes;
  const typeMatches = String(storedObject.contentType ?? '').toLowerCase() === file.mime_type.toLowerCase();

  if (!sizeMatches || !typeMatches) {
    //* Row first (company-scoped), object second and best-effort
    await deleteFileInDb(file.id, companyId);
    await deleteS3ObjectBestEffort(file.s3_key);

    logAudit(req, 'file.upload.discarded', { entity: 'file', entityId: file.id });

    return res.status(400).json({
      message: 'The uploaded object does not match the declared size or content type - the upload was discarded',
      code: 'FILE_UPLOAD_MISMATCH',
    });
  }

  const readyFile = await markFileReadyInDb(file.id, confirmableAfter);

  if (!readyFile) {
    //* No longer a young-enough pending row: a concurrent confirm won (answer
    //* like a retry), the row was deleted meanwhile, or it crossed the
    //* confirm window during the HEAD request
    const currentFile = await getFileByIdInDb(file.id, companyId);

    if (!currentFile) {
      return res.status(404).json({
        message: 'File does not exist',
      });
    }

    if (currentFile.status === 'ready') {
      return res.status(200).json({
        file: toFileShape(currentFile),
      });
    }

    return uploadExpiredResponse(res);
  }

  logAudit(req, 'file.upload.confirmed', { entity: 'file', entityId: readyFile.id });

  return res.status(200).json({
    file: toFileShape(readyFile),
  });
};

export const getFiles = async (req, res) => {
  const { company_id: companyId } = req.user;

  const { limit, cursor } = parsePagination(req.query);

  const files = await getFilesInDb(companyId, { limit, cursor });

  const nextCursor = files.length === limit && files.length > 0
    ? files[files.length - 1].id
    : undefined;

  return res.status(200).json({
    files: files.map(toFileShape),
    nextCursor,
  });
};

export const getFileDownloadUrl = async (req, res) => {
  const { fileId } = req.params;

  const { company_id: companyId } = req.user;

  //* 404 (not 403) for other companies' files - same anti-enumeration shape
  //* as the team endpoints. Unconfirmed uploads cannot be downloaded
  const file = await getFileByIdInDb(fileId, companyId, 'ready');

  if (!file) {
    return res.status(404).json({
      message: 'File does not exist',
    });
  }

  //* Forced download under the catalog filename and verified MIME type - the
  //* object is never rendered inline on the bucket origin
  const url = await presignGetObject(file.s3_key, {
    filename: file.original_filename,
    contentType: file.mime_type,
  });

  return res.status(200).json({
    url,
  });
};

export const deleteOneFileById = async (req, res) => {
  const { fileId } = req.params;

  const { company_id: companyId } = req.user;

  const file = await getFileByIdInDb(fileId, companyId);

  if (!file) {
    return res.status(404).json({
      message: 'File does not exist',
    });
  }

  //* The row goes first, with a company-scoped conditional delete: a file
  //* deleted concurrently answers 404 and its object is never touched twice.
  //* The object is removed afterwards, best-effort (missing keys are a no-op)
  const rowDeleted = await deleteFileInDb(file.id, companyId);

  if (!rowDeleted) {
    return res.status(404).json({
      message: 'File does not exist',
    });
  }

  await deleteS3ObjectBestEffort(file.s3_key);

  logAudit(req, 'file.deleted', { entity: 'file', entityId: file.id });

  return res.status(200).json({
    fileId: file.id,
  });
};
