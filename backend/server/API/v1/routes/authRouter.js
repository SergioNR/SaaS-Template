import { Router } from 'express';
import { checkSchema } from 'express-validator';
import {
  registerUser,
  checkSession,
  requestPasswordResetToken,
  loginLocal,
  checkPasswordResetTokenValidity,
  updateRecoveredUserPassword,
  logoutUser,
  checkTeamInviteValidity,
  acceptTeamInvite,
} from '../../../controllers/authController.js';
import { updateUserPassword } from '../../../controllers/userController.js';
import { sanitizerResult } from '../../../middlewares/sanitizerResult.js';
import { authLimiter } from '../../../middlewares/authRateLimiter.js';
import { passwordResetLimiter } from '../../../middlewares/passwordResetRateLimiter.js';
import { loginAccountLimiter } from '../../../middlewares/loginAccountRateLimiter.js';
import { createUserValidationSchema } from '../../../utils/validators/createUserSchema.js';
import { userLoginValidationSchema } from '../../../utils/validators/userLoginValidationSchema.js';

import { updatePasswordSchema } from '../../../utils/validators/updatePasswordSchema.js';
import { recoverPasswordSchema } from '../../../utils/validators/recoverPasswordSchema.js';
import { checkAuthentication } from '../../../middlewares/authenticationChecker.js';
import { requestNewPasswordSchema } from '../../../utils/validators/requestNewPasswordSchema.js';
import { passwordResetTokenQuerySchema } from '../../../utils/validators/passwordResetTokenQuerySchema.js';
import { teamInviteTokenQuerySchema } from '../../../utils/validators/teamInviteTokenQuerySchema.js';
import { acceptTeamInviteSchema } from '../../../utils/validators/acceptTeamInviteSchema.js';

//* Public (unauthenticated) routes - session establishment, credential
//* recovery and invite consumption
const authPublicRouter = Router();

//* Gated routes - every route carries `requireSession` in its own chain, so
//* what a route requires is visible at its definition and paths that match
//* no route still reach the 404 fallback without a session (a router-level
//* gate would answer 401 to every typo under /api/v1/auth)
const authPrivateRouter = Router();
const requireSession = checkAuthentication();

export const authRouter = Router();

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Log in with email and password
 *     description: Authenticates the user with the local strategy and establishes a session cookie (`app.sid`). Failed attempts are throttled per IP and per account (5 failures / 15 min per email).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Login successful. A session cookie is set on the client.
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
 *                     role:
 *                       type: string
 *                       enum: [user, superadmin]
 *       401:
 *         description: Incorrect email or password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         description: Too many authentication attempts (per IP) or too many failed attempts for this account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
//* loginAccountLimiter runs after the validator so it keys on the normalized email
authPublicRouter.post('/login', authLimiter, checkSchema(userLoginValidationSchema), sanitizerResult, loginAccountLimiter, loginLocal);

/**
 * @openapi
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user and their company (onboarding)
 *     description: |
 *       Self-service onboarding. In one transaction it creates:
 *       - a new company named `companyName` (required, 2-100 characters after trimming), with a 7-day free trial subscription
 *       - the user, with the global `user` role, as that company's first member
 *       - a `company_owner` role assignment for the user, which grants every company permission, billing included
 *
 *       Additional members join an existing company only through team invites (`POST /api/v1/auth/invite-accept`) and never become owners automatically.
 *
 *       The work runs after the response is sent. The 201 response is identical whether or not the email is already registered, so the endpoint cannot be used to enumerate accounts. An already-registered email receives an existing-account notice by email and no company is created.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: Registration accepted - the company and its owner are created (or the email is already registered - the response is identical)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
authPublicRouter.post('/register', authLimiter, checkSchema(createUserValidationSchema), sanitizerResult, registerUser);

/**
 * @openapi
 * /api/v1/auth/password-reset:
 *   get:
 *     tags: [Auth]
 *     summary: Check password reset token validity
 *     description: Retrieves the data of a password reset token and whether it is still valid.
 *     parameters:
 *       - in: query
 *         name: passwordResetToken
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[A-Za-z0-9_-]{43}$'
 *           description: Opaque base64url token from the email link (only its SHA-256 hash is stored)
 *     responses:
 *       200:
 *         description: Token exists and is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Token is missing from the query string or malformed, has expired (code `INVITE_EXPIRED`), or the inviter left the company or can no longer grant the role (code `INVITER_INVALID`)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [INVITE_EXPIRED, INVITER_INVALID]
 *                       description: Absent for malformed-token validation errors
 *       404:
 *         description: Token does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
authPublicRouter.get('/password-reset', authLimiter, checkSchema(passwordResetTokenQuerySchema), sanitizerResult, checkPasswordResetTokenValidity);

/**
 * @openapi
 * /api/v1/auth/password-reset:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset token by email
 *     description: Sends a password reset link to the given email if the user exists. The response is identical either way to prevent user enumeration.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PasswordResetRequest'
 *     responses:
 *       200:
 *         description: Reset link will be sent if the email exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         description: Too many password reset requests
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
authPublicRouter.post('/password-reset', passwordResetLimiter, checkSchema(requestNewPasswordSchema), sanitizerResult, requestPasswordResetToken);

/**
 * @openapi
 * /api/v1/auth/password-reset:
 *   patch:
 *     tags: [Auth]
 *     summary: Update password using a reset token
 *     description: Sets a new password for the user owning a valid, non-expired password reset token, deletes all of that user's reset tokens and revokes all of that user's active sessions.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RecoverPasswordRequest'
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Token is unknown, expired or already used, or the passwords do not match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
authPublicRouter.patch('/password-reset', authLimiter, checkSchema(recoverPasswordSchema), sanitizerResult, updateRecoveredUserPassword);

/**
 * @openapi
 * /api/v1/auth/invite:
 *   get:
 *     tags: [Auth]
 *     summary: Check team invite token validity
 *     description: Retrieves the data of a team invite (invited email, company name and offered role) and whether it is still valid. Invite links are single-use per company and email and expire after 7 days. An invite is only valid while its inviter is still a company member able to grant the invited role.
 *     parameters:
 *       - in: query
 *         name: inviteToken
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^[A-Za-z0-9_-]{43}$'
 *           description: Opaque base64url token from the email link (only its SHA-256 hash is stored)
 *     responses:
 *       200:
 *         description: Invite exists and is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 email:
 *                   type: string
 *                   format: email
 *                 companyName:
 *                   type: string
 *                   nullable: true
 *                 roleName:
 *                   type: string
 *       400:
 *         description: Token is missing from the query string, is malformed or has expired
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       404:
 *         description: Token does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
authPublicRouter.get('/invite', authLimiter, checkSchema(teamInviteTokenQuerySchema), sanitizerResult, checkTeamInviteValidity);

/**
 * @openapi
 * /api/v1/auth/invite-accept:
 *   post:
 *     tags: [Auth]
 *     summary: Accept a team invite and create the account
 *     description: Validates the invite token, creates the user in the invited company with the invited company role and the global `user` role, and deletes the invite. The inviter is re-checked under the company lock in the same transaction as the user creation - when they left the company or can no longer grant the role the invite is voided (400, code `INVITER_INVALID`). No session is established - the new member logs in afterwards.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AcceptInviteRequest'
 *     responses:
 *       201:
 *         description: Account created successfully - the user can now log in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: Token is malformed, has expired or was consumed/rotated meanwhile (code `INVITE_EXPIRED`), or the inviter left the company or can no longer grant the role - the invite was voided (code `INVITER_INVALID`)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ErrorMessage'
 *                 - type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       enum: [INVITE_EXPIRED, INVITER_INVALID]
 *                       description: Absent for malformed-token validation errors
 *       404:
 *         description: Token does not exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: The invited email became registered in the meantime - the invite was revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 */
authPublicRouter.post('/invite-accept', authLimiter, checkSchema(acceptTeamInviteSchema), sanitizerResult, acceptTeamInvite);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Log out the current user
 *     description: Destroys the current session and clears the session cookie on the client.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: User logged out successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       400:
 *         description: User is not logged in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
authPrivateRouter.post('/logout', requireSession, logoutUser);

/**
 * @openapi
 * /api/v1/auth/update-user-password:
 *   patch:
 *     tags: [Auth]
 *     deprecated: true
 *     summary: Update the password of the logged-in user (deprecated alias)
 *     description: Deprecated alias of `PATCH /api/v1/user/password` - same handler, request and responses. Kept so existing clients keep working; new clients must call `PATCH /api/v1/user/password`.
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
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
//* Deprecated alias of PATCH /api/v1/user/password (same handler) - remove once
//* every client calls the user route
authPrivateRouter.patch('/update-user-password', requireSession, checkSchema(updatePasswordSchema), sanitizerResult, updateUserPassword);

/**
 * @openapi
 * /api/v1/auth/session:
 *   get:
 *     tags: [Auth]
 *     summary: Check whether the current session is valid
 *     description: Returns the logged-in user id and platform role (`user` / `superadmin`) when the session cookie is valid.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Session is valid
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
 *                     role:
 *                       type: string
 *                       enum: [user, superadmin]
 *       401:
 *         description: Session is invalid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
authPrivateRouter.get('/session', requireSession, checkSession);

//* Composition: public routes first, then the private ones (each gated at its
//* own definition), then the fallback - reachable with or without a session
authRouter.use(authPublicRouter);
authRouter.use(authPrivateRouter);

authRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Catches every unmatched auth path, authenticated or not
});
