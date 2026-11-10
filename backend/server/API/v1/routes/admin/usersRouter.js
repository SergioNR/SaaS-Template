import { Router } from 'express';
import { checkSchema, param } from 'express-validator';
import {
  deleteOneUserById,
  getAllUsers,
  getOneUserById,
} from '../../../../controllers/adminController.js';
import { sanitizerResult } from '../../../../middlewares/sanitizerResult.js';
import { adminUserListQueryValidationSchema } from '../../../../utils/validators/adminUserListQuerySchema.js';

//* Mounted on /users by admin/index.js - the superadmin gate rides the
//* single /v1/admin mount in apiRouter
export const usersRouter = Router();

const userIdParamValidation = [
  param('userId').isUUID().withMessage('User id must be a valid UUID'),
  sanitizerResult,
];

const userListQueryValidation = [
  checkSchema(adminUserListQueryValidationSchema),
  sanitizerResult,
];

/**
 * @openapi
 * /api/v1/admin/users:
 *   get:
 *     tags: [Admin]
 *     summary: List all users (superadmin only)
 *     description: Returns the users in the database, newest first, with cursor-based pagination. Requires an authenticated session with the `superadmin` platform role.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: query
 *         name: role
 *         required: false
 *         schema:
 *           type: string
 *           enum: [user, superadmin]
 *         description: Optional filter by role. Any other query parameter is ignored.
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *           maxLength: 100
 *         description: Optional case-insensitive partial match on the user email.
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
 *         description: User id to paginate after (the `nextCursor` value of the previous page).
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userCount:
 *                   type: integer
 *                   description: Total number of users matching the filter
 *                 users:
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
usersRouter.get('/', userListQueryValidation, getAllUsers);

/**
 * @openapi
 * /api/v1/admin/users/{userId}:
 *   get:
 *     tags: [Admin]
 *     summary: Get a single user with related data (superadmin only)
 *     description: Returns the user plus its related company (with the Stripe customer id reduced to a `stripeLinked` boolean), the company subscription (public fields) and the count of active sessions.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Id of the user to retrieve
 *     responses:
 *       200:
 *         description: User retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [user, superadmin]
 *                     company_id:
 *                       type: string
 *                       nullable: true
 *                       description: Null for superadmins, who belong to no company
 *                     company:
 *                       type: object
 *                       nullable: true
 *                     activeSessionCount:
 *                       type: integer
 *       404:
 *         description: User not found
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
usersRouter.get('/:userId', userIdParamValidation, getOneUserById);

/**
 * @openapi
 * /api/v1/admin/users/{userId}:
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a user by id (superadmin only)
 *     description: Same transactional deletion as the self-delete endpoint (sessions revoked, company data removed when the user was its last member, Stripe/S3 cleanup after the commit). The last-owner rule applies here too - the last owner of a company with other members cannot be deleted (409, code `LAST_COMPANY_OWNER`); promote another member first.
 *     security:
 *       - sessionCookie: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Id of the user to delete
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 userId:
 *                   type: string
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
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: Superadmin tried to delete their own account via the admin endpoint, the user is the last owner of a company with other members (code `LAST_COMPANY_OWNER`), or related DB entries exist (nothing was deleted)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [LAST_COMPANY_OWNER]
 *                       description: Only present for the last-owner conflict
 *       422:
 *         description: Validation errors
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
usersRouter.delete('/:userId', userIdParamValidation, deleteOneUserById);
