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
 *     description: Returns the companies in the database, newest first, with cursor-based pagination, their user count and their subscription (public fields). The Stripe customer id is never exposed - only a `stripeLinked` boolean.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Optional case-insensitive partial match on the company name.
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *         description: Page size.
 *       - in: query
 *         name: cursor
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Company id to paginate after (the `nextCursor` value of the previous page).
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
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Missing permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         description: Validation errors
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
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
 *                       type: object
 *                       nullable: true
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Company not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       401:
 *         description: Not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       403:
 *         description: Missing permissions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         description: Validation errors
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
companiesRouter.get('/:companyId', companyIdParamValidation, getOneCompanyById);
