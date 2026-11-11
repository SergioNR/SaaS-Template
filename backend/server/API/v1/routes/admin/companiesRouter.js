import { Router } from 'express';
import { checkSchema, param } from 'express-validator';
import {
  getAllCompanies,
  getOneCompanyById,
} from '../../../../controllers/adminController.js';
import { sanitizerResult } from '../../../../middlewares/sanitizerResult.js';
import { adminCompanyListQueryValidationSchema } from '../../../../utils/validators/adminCompanyListQuerySchema.js';

//* Mounted on /companies by admin/index.js
export const companiesRouter = Router();

const companyIdParamValidation = [
  param('companyId').isUUID().withMessage('Company id must be a valid UUID'),
  sanitizerResult,
];

const companyListQueryValidation = [
  checkSchema(adminCompanyListQueryValidationSchema),
  sanitizerResult,
];

/**
 * @openapi
 * /api/v1/admin/companies:
 *   get:
 *     tags: [Admin]
 *     summary: List all companies (superadmin only)
 *     description: Returns the companies in the database, newest first unless `sort` is given, with cursor-based pagination (`search` matches the company name; the `stripe_linked` and `created_*` filters combine with it and `companyCount` counts the matching rows; any other query parameter is ignored), their user count and their subscription (public fields). The Stripe customer id is never exposed - only a `stripeLinked` boolean.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - $ref: '#/components/parameters/SearchQuery'
 *       - $ref: '#/components/parameters/LimitQuery'
 *       - $ref: '#/components/parameters/CursorQuery'
 *     responses:
 *       200:
 *         description: Companies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 companyCount:
 *                   type: integer
 *                   description: Total number of companies matching the filter
 *                 companies:
 *                   type: array
 *                   items:
 *                     type: object
 *                 nextCursor:
 *                   type: string
 *                   nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
companiesRouter.get('/', companyListQueryValidation, getAllCompanies);

/**
 * @openapi
 * /api/v1/admin/companies/{companyId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single company with related data (superadmin only)
 *     description: Returns the company plus its users (safe fields only) and its subscription (public fields). The Stripe customer id is never exposed - only a `stripeLinked` boolean.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Id of the company to retrieve
 *     responses:
 *       200:
 *         description: Company retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                       nullable: true
 *                     stripeLinked:
 *                       type: boolean
 *                     subscription:
 *                       allOf:
 *                         - $ref: '#/components/schemas/PublicSubscription'
 *                       nullable: true
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
companiesRouter.get('/:companyId', companyIdParamValidation, getOneCompanyById);
