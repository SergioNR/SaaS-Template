import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/filesModel.js', () => ({
  countPendingFilesInDb: jest.fn(),
  createFileInDb: jest.fn(),
  getFilesInDb: jest.fn(),
  getFileByIdInDb: jest.fn(),
  deleteFileInDb: jest.fn(),
  markFileReadyInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/config/s3.js', () => ({
  MAX_PENDING_UPLOADS_PER_COMPANY: 20,
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logWarn: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/s3/headS3Object.js', () => ({
  headS3Object: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/s3/presignPutObject.js', () => ({
  presignPutObject: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/s3/presignGetObject.js', () => ({
  presignGetObject: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/s3/deleteS3Objects.js', () => ({
  deleteS3Objects: jest.fn(),
}));

const {
  confirmFileUpload,
  createFileUpload,
  deleteOneFileById,
  getFileDownloadUrl,
  getFiles,
} = await import('../server/controllers/filesController.js');
const {
  countPendingFilesInDb,
  createFileInDb,
  deleteFileInDb,
  getFileByIdInDb,
  getFilesInDb,
  markFileReadyInDb,
} = await import('../server/models/filesModel.js');
const { headS3Object } = await import('../server/integrations/s3/headS3Object.js');
const { presignGetObject } = await import('../server/integrations/s3/presignGetObject.js');
const { presignPutObject } = await import('../server/integrations/s3/presignPutObject.js');
const { deleteS3Objects } = await import('../server/integrations/s3/deleteS3Objects.js');
const { logWarn } = await import('../server/config/loggerFunctions.js');
const {
  PENDING_FILE_CONFIRM_MAX_AGE_MS,
  PENDING_FILE_MAX_AGE_MS,
} = await import('../server/config/pendingFileUploads.js');

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

const caller = {
  id: 'caller-id',
  email: 'user@acme.test',
  role: 'user',
  company_id: 'company-1',
};

const fileRecord = (overrides = {}) => ({
  id: 'file-1',
  company_id: 'company-1',
  uploaded_by: 'caller-id',
  s3_key: 'company-1/file-1/report.pdf',
  original_filename: 'report.pdf',
  mime_type: 'application/pdf',
  size_bytes: 1234,
  status: 'ready',
  created_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('createFileUpload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    countPendingFilesInDb.mockResolvedValue(0);
    deleteS3Objects.mockResolvedValue({ deletedCount: 1, failedKeys: [] });
  });

  it('answers 409 with a stable code when the company has too many unconfirmed uploads', async () => {
    countPendingFilesInDb.mockResolvedValue(20);

    const req = {
      user: caller,
      body: { filename: 'a.txt', contentType: 'text/plain', sizeBytes: 1 },
    };
    const res = mockRes();

    await createFileUpload(req, res);

    expect(countPendingFilesInDb).toHaveBeenCalledWith('company-1');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_PENDING_UPLOAD_LIMIT' }));
    expect(presignPutObject).not.toHaveBeenCalled();
    expect(createFileInDb).not.toHaveBeenCalled();
  });

  it('presigns the derived key, registers the row and returns 201', async () => {
    presignPutObject.mockResolvedValue('https://bucket.s3/upload-url');
    createFileInDb.mockImplementation(async (fileData) => fileRecord({
      id: fileData.id,
      s3_key: fileData.s3Key,
      original_filename: fileData.originalFilename,
      status: 'pending',
    }));

    const req = {
      user: caller,
      body: { filename: 'quarterly report.pdf', contentType: 'application/pdf', sizeBytes: 1234 },
    };
    const res = mockRes();

    await createFileUpload(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    const [createdData] = createFileInDb.mock.calls[0];
    expect(createdData.companyId).toBe('company-1');
    expect(createdData.uploadedBy).toBe('caller-id');
    expect(createdData.originalFilename).toBe('quarterly_report.pdf');
    expect(createdData.s3Key).toBe(`company-1/${createdData.id}/quarterly_report.pdf`);
    //* Size is signed into the URL so the bucket rejects a different payload length
    expect(presignPutObject).toHaveBeenCalledWith(createdData.s3Key, 'application/pdf', 1234);

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.uploadUrl).toBe('https://bucket.s3/upload-url');
    expect(responseBody.file).toMatchObject({
      original_filename: 'quarterly_report.pdf',
      mime_type: 'application/pdf',
      size_bytes: 1234,
      status: 'pending',
      uploaded_by: 'caller-id',
    });
  });

  it('presigns before inserting the row', async () => {
    presignPutObject.mockResolvedValue('https://bucket.s3/upload-url');
    createFileInDb.mockImplementation(async (fileData) => fileRecord({ id: fileData.id }));

    const req = {
      user: caller,
      body: { filename: 'a.txt', contentType: 'text/plain', sizeBytes: 1 },
    };

    await createFileUpload(req, mockRes());

    expect(presignPutObject.mock.invocationCallOrder[0]).toBeLessThan(createFileInDb.mock.invocationCallOrder[0]);
  });

  it('never creates the row when presigning fails', async () => {
    presignPutObject.mockRejectedValue(new Error('S3 unreachable'));

    const req = {
      user: caller,
      body: { filename: 'a.txt', contentType: 'text/plain', sizeBytes: 1 },
    };
    const res = mockRes();

    await expect(createFileUpload(req, res)).rejects.toThrow('S3 unreachable');

    expect(createFileInDb).not.toHaveBeenCalled();
  });
});

describe('confirmFileUpload', () => {
  //* Created just now - well inside the confirm window
  const pendingFile = (overrides = {}) => fileRecord({ status: 'pending', created_at: new Date().toISOString(), ...overrides });

  const confirm = async () => {
    const res = mockRes();
    await confirmFileUpload({ user: caller, params: { fileId: 'file-1' } }, res);
    return res;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    deleteS3Objects.mockResolvedValue({ deletedCount: 1, failedKeys: [] });
    deleteFileInDb.mockResolvedValue(true);
  });

  it('answers 404 when the file does not exist in the caller company', async () => {
    getFileByIdInDb.mockResolvedValue(null);

    const res = await confirm();

    expect(getFileByIdInDb).toHaveBeenCalledWith('file-1', 'company-1');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(headS3Object).not.toHaveBeenCalled();
  });

  it('answers 404 to a company member who did not upload the pending file', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile({ uploaded_by: 'other-member' }));

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(headS3Object).not.toHaveBeenCalled();
    expect(markFileReadyInDb).not.toHaveBeenCalled();
    expect(deleteFileInDb).not.toHaveBeenCalled();
  });

  it('is idempotent for an already ready file', async () => {
    getFileByIdInDb.mockResolvedValue(fileRecord());

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(headS3Object).not.toHaveBeenCalled();
    expect(markFileReadyInDb).not.toHaveBeenCalled();
  });

  it('answers 409 and keeps the pending row when the object was not uploaded yet', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile());
    headS3Object.mockResolvedValue(null);

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_UPLOAD_MISSING' }));
    expect(deleteFileInDb).not.toHaveBeenCalled();
    expect(markFileReadyInDb).not.toHaveBeenCalled();
  });

  it('discards row and object when the stored size differs from the declared one', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile());
    headS3Object.mockResolvedValue({ contentLength: 9999, contentType: 'application/pdf' });

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_UPLOAD_MISMATCH' }));
    //* Row first (company-scoped), then the object
    expect(deleteFileInDb).toHaveBeenCalledWith('file-1', 'company-1');
    expect(deleteS3Objects).toHaveBeenCalledWith(['company-1/file-1/report.pdf']);
    expect(deleteFileInDb.mock.invocationCallOrder[0]).toBeLessThan(deleteS3Objects.mock.invocationCallOrder[0]);
    expect(markFileReadyInDb).not.toHaveBeenCalled();
  });

  it('discards row and object when the stored content type differs from the declared one', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile());
    headS3Object.mockResolvedValue({ contentLength: 1234, contentType: 'text/html' });

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(400);
    expect(deleteFileInDb).toHaveBeenCalledWith('file-1', 'company-1');
  });

  it('marks the file ready when size and content type match', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile());
    headS3Object.mockResolvedValue({ contentLength: 1234, contentType: 'application/pdf' });
    markFileReadyInDb.mockResolvedValue(fileRecord({ status: 'ready' }));

    const res = await confirm();

    const [, confirmableAfter] = markFileReadyInDb.mock.calls[0];
    expect(markFileReadyInDb).toHaveBeenCalledWith('file-1', expect.any(Date));
    //* Only rows younger than the confirm window may flip to ready
    expect(Date.now() - confirmableAfter.getTime()).toBeGreaterThanOrEqual(PENDING_FILE_CONFIRM_MAX_AGE_MS - 1000);
    expect(Date.now() - confirmableAfter.getTime()).toBeLessThan(PENDING_FILE_MAX_AGE_MS);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ file: expect.objectContaining({ id: 'file-1', status: 'ready' }) });
  });

  it('answers 409 FILE_UPLOAD_EXPIRED without touching the bucket for a row past the confirm window', async () => {
    getFileByIdInDb.mockResolvedValue(pendingFile({
      created_at: new Date(Date.now() - PENDING_FILE_CONFIRM_MAX_AGE_MS - 1000).toISOString(),
    }));

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_UPLOAD_EXPIRED' }));
    expect(headS3Object).not.toHaveBeenCalled();
    expect(markFileReadyInDb).not.toHaveBeenCalled();
  });

  it('answers 409 FILE_UPLOAD_EXPIRED when the conditional update finds the row still pending but too old', async () => {
    getFileByIdInDb
      .mockResolvedValueOnce(pendingFile())
      .mockResolvedValueOnce(pendingFile());
    headS3Object.mockResolvedValue({ contentLength: 1234, contentType: 'application/pdf' });
    markFileReadyInDb.mockResolvedValue(null);

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'FILE_UPLOAD_EXPIRED' }));
  });

  it('answers 404 when the row was removed in between', async () => {
    getFileByIdInDb
      .mockResolvedValueOnce(pendingFile())
      .mockResolvedValueOnce(null);
    headS3Object.mockResolvedValue({ contentLength: 1234, contentType: 'application/pdf' });
    markFileReadyInDb.mockResolvedValue(null);

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('answers 200 like a retry when a concurrent confirm already made the file ready', async () => {
    getFileByIdInDb
      .mockResolvedValueOnce(pendingFile())
      .mockResolvedValueOnce(fileRecord({ status: 'ready' }));
    headS3Object.mockResolvedValue({ contentLength: 1234, contentType: 'application/pdf' });
    markFileReadyInDb.mockResolvedValue(null);

    const res = await confirm();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ file: expect.objectContaining({ status: 'ready' }) });
  });
});

describe('getFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the company files with no cursor on the last page', async () => {
    getFilesInDb.mockResolvedValue([fileRecord()]);

    const req = { user: caller, query: {} };
    const res = mockRes();

    await getFiles(req, res);

    expect(getFilesInDb).toHaveBeenCalledWith('company-1', { limit: 50, cursor: undefined });
    expect(res.status).toHaveBeenCalledWith(200);

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.files).toHaveLength(1);
    expect(responseBody.files[0]).toMatchObject({ id: 'file-1', original_filename: 'report.pdf' });
    expect(responseBody.nextCursor).toBeUndefined();
  });

  it('returns nextCursor when the page is full and caps the limit at 100', async () => {
    const fullPage = Array.from({ length: 100 }, (_, index) => fileRecord({ id: `file-${index}` }));
    getFilesInDb.mockResolvedValue(fullPage);

    const req = { user: caller, query: { limit: '500' } };
    const res = mockRes();

    await getFiles(req, res);

    expect(getFilesInDb).toHaveBeenCalledWith('company-1', { limit: 100, cursor: undefined });

    const responseBody = res.json.mock.calls[0][0];
    expect(responseBody.nextCursor).toBe('file-99');
  });
});

describe('getFileDownloadUrl', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('answers 404 when the file does not exist in the caller company', async () => {
    getFileByIdInDb.mockResolvedValue(null);

    const req = { user: caller, params: { fileId: 'other-company-file' } };
    const res = mockRes();

    await getFileDownloadUrl(req, res);

    expect(getFileByIdInDb).toHaveBeenCalledWith('other-company-file', 'company-1', 'ready');
    expect(res.status).toHaveBeenCalledWith(404);
    expect(presignGetObject).not.toHaveBeenCalled();
  });

  it('returns a presigned download URL pinned to the catalog filename and verified MIME type', async () => {
    getFileByIdInDb.mockResolvedValue(fileRecord());
    presignGetObject.mockResolvedValue('https://bucket.s3/download-url');

    const req = { user: caller, params: { fileId: 'file-1' } };
    const res = mockRes();

    await getFileDownloadUrl(req, res);

    expect(presignGetObject).toHaveBeenCalledWith('company-1/file-1/report.pdf', {
      filename: 'report.pdf',
      contentType: 'application/pdf',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ url: 'https://bucket.s3/download-url' });
  });
});

describe('deleteOneFileById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    deleteS3Objects.mockResolvedValue({ deletedCount: 1, failedKeys: [] });
  });

  it('answers 404 when the file does not exist in the caller company', async () => {
    getFileByIdInDb.mockResolvedValue(null);

    const req = { user: caller, params: { fileId: 'other-company-file' } };
    const res = mockRes();

    await deleteOneFileById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteS3Objects).not.toHaveBeenCalled();
    expect(deleteFileInDb).not.toHaveBeenCalled();
  });

  it('deletes the row (company-scoped) first and the object best-effort afterwards', async () => {
    getFileByIdInDb.mockResolvedValue(fileRecord());
    deleteFileInDb.mockResolvedValue(true);

    const req = { user: caller, params: { fileId: 'file-1' } };
    const res = mockRes();

    await deleteOneFileById(req, res);

    expect(deleteFileInDb).toHaveBeenCalledWith('file-1', 'company-1');
    expect(deleteS3Objects).toHaveBeenCalledWith(['company-1/file-1/report.pdf']);
    expect(deleteFileInDb.mock.invocationCallOrder[0]).toBeLessThan(deleteS3Objects.mock.invocationCallOrder[0]);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ fileId: 'file-1' });
  });

  it('answers 404 and never touches the bucket when the row was deleted concurrently', async () => {
    getFileByIdInDb.mockResolvedValue(fileRecord());
    deleteFileInDb.mockResolvedValue(false);

    const req = { user: caller, params: { fileId: 'file-1' } };
    const res = mockRes();

    await deleteOneFileById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(deleteS3Objects).not.toHaveBeenCalled();
  });

  it('still answers 200 and logs when the object delete fails', async () => {
    getFileByIdInDb.mockResolvedValue(fileRecord());
    deleteFileInDb.mockResolvedValue(true);
    deleteS3Objects.mockResolvedValue({ deletedCount: 0, failedKeys: ['company-1/file-1/report.pdf'] });

    const req = { user: caller, params: { fileId: 'file-1' } };
    const res = mockRes();

    await deleteOneFileById(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(logWarn).toHaveBeenCalled();
  });
});
