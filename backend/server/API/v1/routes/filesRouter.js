import { Router } from 'express';
import { checkSchema, param } from 'express-validator';
import {
  confirmFileUpload,
  createFileUpload,
  deleteOneFileById,
  getFileDownloadUrl,
  getFiles,
} from '../../../controllers/filesController.js';
import { sanitizerResult } from '../../../middlewares/sanitizerResult.js';
import { checkCompanyPermission } from '../../../middlewares/companyPermissionChecker.js';
import { createFileUploadSchema } from '../../../utils/validators/createFileUploadSchema.js';
import { filesListQueryValidationSchema } from '../../../utils/validators/filesListQuerySchema.js';

export const filesRouter = Router();

//* Authentication happens at the apiRouter mounting level; each route adds
//* its own company permission requirement on top

const createUploadValidation = [
  checkSchema(createFileUploadSchema),
  sanitizerResult,
];

const filesListValidation = [
  checkSchema(filesListQueryValidationSchema),
  sanitizerResult,
];

const fileIdParamValidation = [
  param('fileId').isUUID().withMessage('File id must be a valid UUID'),
  sanitizerResult,
];

/**
 * @openapi
 * /api/v1/files:
 *   post:
 *     tags: [Files]
 *     summary: Register a file and get a presigned upload URL
 *     description: Validates the declared file metadata (size, MIME whitelist - HTML/SVG/XML are never accepted), creates a `pending` file catalog entry and returns a short-lived presigned PUT URL. The client uploads the bytes directly to the bucket with the exact declared `Content-Type` and `Content-Length` (both are signed), then calls `POST /api/v1/files/{fileId}/confirm`. Pending files are not listed nor downloadable, and pending entries older than one hour are deleted automatically together with their object. A company may hold at most 20 unconfirmed uploads at once (409, code `FILE_PENDING_UPLOAD_LIMIT`). Requires the `files.upload` company permission.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FileUploadRequest'
 *     responses:
 *       201:
 *         description: File registered with status `pending` - upload the bytes to the presigned URL, then confirm
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *                 uploadUrl:
 *                   type: string
 *                   format: uri
 *                   description: Presigned PUT URL (valid for a few minutes)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: Too many unconfirmed uploads for the company (code `FILE_PENDING_UPLOAD_LIMIT`) - confirm them or wait for the hourly cleanup
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [FILE_PENDING_UPLOAD_LIMIT]
 *       422:
 *         description: Validation errors (size over the cap, MIME not whitelisted, invalid filename)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
filesRouter.post('/', checkCompanyPermission('files.upload'), createUploadValidation, createFileUpload);

/**
 * @openapi
 * /api/v1/files/{fileId}/confirm:
 *   post:
 *     tags: [Files]
 *     summary: Confirm a finished upload
 *     description: Call after the PUT to the presigned URL succeeded. The server reads the stored object's metadata and compares it with the size and MIME type declared at registration. On a match the file becomes `ready` (listed and downloadable). On a mismatch the object and the catalog entry are deleted (400, code `FILE_UPLOAD_MISMATCH`). When the object does not exist yet the entry stays pending (409, code `FILE_UPLOAD_MISSING`) and the call can be retried. Uploads must be confirmed within 50 minutes of registration - an older pending entry is no longer accepted (409, code `FILE_UPLOAD_EXPIRED`; register the upload again) because the hourly cleanup may already be deleting its object. Confirming an already-ready file is idempotent. Only the member who registered the upload can confirm it (other members get 404); the presigned PUT URL is valid for 5 minutes. Requires the `files.upload` company permission.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id of the file to confirm
 *     responses:
 *       200:
 *         description: Upload verified - the file is ready
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/File'
 *       400:
 *         description: Stored object does not match the declared size or content type - object and entry were deleted (code `FILE_UPLOAD_MISMATCH`)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: File does not exist in the caller's company
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: The object was not uploaded yet - entry stays pending (code `FILE_UPLOAD_MISSING`), or the upload is past its confirm window (code `FILE_UPLOAD_EXPIRED`)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [FILE_UPLOAD_MISSING, FILE_UPLOAD_EXPIRED]
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
filesRouter.post('/:fileId/confirm', checkCompanyPermission('files.upload'), fileIdParamValidation, confirmFileUpload);

/**
 * @openapi
 * /api/v1/files:
 *   get:
 *     tags: [Files]
 *     summary: List the caller's company files
 *     description: Cursor-paginated list of the confirmed (`ready`) files of the caller's company, newest first (id as tiebreaker). Pending uploads are never listed. Requires the `files.view` company permission.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/CursorQuery'
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/File'
 *                 nextCursor:
 *                   type: string
 *                   format: uuid
 *                   description: Present only when another page exists
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
filesRouter.get('/', checkCompanyPermission('files.view'), filesListValidation, getFiles);

/**
 * @openapi
 * /api/v1/files/{fileId}/download:
 *   get:
 *     tags: [Files]
 *     summary: Get a presigned download URL for a company file
 *     description: Returns a fresh short-lived presigned GET URL for the file's object. The URL pins `Content-Disposition` to `attachment` (under the catalog filename) and `Content-Type` to the verified MIME type, so the object is downloaded rather than rendered on the bucket origin. URLs expire within minutes - request a new one when needed. Files outside the caller's company answer 404 (no existence leak). Requires the `files.view` company permission. Pending (unconfirmed) files answer 404.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id of the file to download
 *     responses:
 *       200:
 *         description: Presigned download URL generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *                   description: Presigned GET URL (valid for a few minutes)
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: File does not exist in the caller's company, or its upload is not confirmed yet
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
filesRouter.get('/:fileId/download', checkCompanyPermission('files.view'), fileIdParamValidation, getFileDownloadUrl);

/**
 * @openapi
 * /api/v1/files/{fileId}:
 *   delete:
 *     tags: [Files]
 *     summary: Delete a company file
 *     description: Removes the file's catalog entry (company-scoped conditional delete - a concurrently deleted file answers 404) and then its bucket object, best-effort (a failed object delete is logged, never reported). Only files of the caller's company can be deleted. Requires the `files.delete` company permission.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Id of the file to delete
 *     responses:
 *       200:
 *         description: File deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 fileId:
 *                   type: string
 *                   format: uuid
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: File does not exist in the caller's company
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
filesRouter.delete('/:fileId', checkCompanyPermission('files.delete'), fileIdParamValidation, deleteOneFileById);

filesRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
