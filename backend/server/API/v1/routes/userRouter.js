import { Router } from 'express';
import { checkSchema } from 'express-validator';
import { getUserProfile, deleteUser, updateUserPassword } from '../../../controllers/userController.js';
import { passwordChangeLimiter } from '../../../middlewares/passwordChangeRateLimiter.js';
import { sanitizerResult } from '../../../middlewares/sanitizerResult.js';
import { updatePasswordSchema } from '../../../utils/validators/updatePasswordSchema.js';

export const userRouter = Router();

/**
 * @openapi
 * /api/v1/user:
 *   get:
 *     tags: [User]
 *     summary: Get the profile of the logged-in user
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: User profile retrieved successfully
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
 *                       format: uuid
 *                     email:
 *                       type: string
 *                       format: email
 *                     role:
 *                       type: string
 *                       enum: [user, superadmin]
 *                     company_id:
 *                       type: string
 *                       format: uuid
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     last_updated_at:
 *                       type: string
 *                       format: date-time
 *                     last_login_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
userRouter.get('/', getUserProfile);

/**
 * @openapi
 * /api/v1/user/password:
 *   patch:
 *     tags: [User]
 *     summary: Update the password of the logged-in user
 *     description: Validates the current password before setting the new one. In one transaction the hash is replaced, every outstanding password reset token is deleted and every other session of the user is revoked - the current session stays logged in. Replaces the deprecated `PATCH /api/v1/auth/update-user-password`.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdatePasswordRequest'
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: 'object'
 *               properties:
 *                 userId:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Current password is incorrect, or the new password is the same as the current one - disambiguated by `code`
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       enum: [Current password is incorrect, New password must be different from the current password]
 *                     code:
 *                       type: string
 *                       enum: [AUTH_CURRENT_PASSWORD_INCORRECT, AUTH_PASSWORD_UNCHANGED]
 *                       description: Machine-readable reason distinguishing the two 400 cases
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         description: Too many failed password change attempts - at most 5 wrong current passwords per account per 15 minutes; answered before the current password is checked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
userRouter.patch('/password', checkSchema(updatePasswordSchema), sanitizerResult, passwordChangeLimiter, updateUserPassword);

/**
 * @openapi
 * /api/v1/user:
 *   delete:
 *     tags: [User]
 *     summary: Delete the logged-in user account
 *     description: Deletes the account and revokes its sessions in one transaction; when the user was the last company member the company, its subscription, invites and files are removed too (the Stripe subscription is cancelled at period end and bucket objects deleted after the commit). The last company owner cannot delete their account while other members remain (409, code `USER_LAST_COMPANY_OWNER`) - they must promote another owner first.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: User deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: User no longer exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: Caller is the last company owner while other members remain (code `USER_LAST_COMPANY_OWNER`), or related DB entries exist (nothing was deleted)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       500:
 *         description: User deletion failed - please try again later
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
userRouter.delete('/', deleteUser);

userRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
