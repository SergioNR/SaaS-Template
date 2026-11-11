import { Router } from 'express';
import { getAdminStats } from '../../../../controllers/adminController.js';

//* Mounted on /stats by admin/index.js
export const statsRouter = Router();

/**
 * @openapi
 * /api/v1/admin/stats:
 *   get:
 *     tags: [Admin]
 *     summary: Platform counters for the admin overview (superadmin only)
 *     description: Returns aggregated counts - users (total, superadmins, new in the last 7 days), companies, subscriptions (total, active paid and active trials) and active sessions. `activeSubscriptions` counts Stripe-backed subscriptions whose `expires_at` is in the future; `activeTrials` counts trials (no Stripe subscription) whose `expires_at` is in the future.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Stats retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *                   properties:
 *                     totalUsers:
 *                       type: integer
 *                     totalSuperadmins:
 *                       type: integer
 *                     newUsersLastWeek:
 *                       type: integer
 *                     totalCompanies:
 *                       type: integer
 *                     totalSubscriptions:
 *                       type: integer
 *                     activeSubscriptions:
 *                       type: integer
 *                       description: Paid (Stripe-backed) subscriptions whose `expires_at` is in the future
 *                     activeTrials:
 *                       type: integer
 *                       description: Trials whose `expires_at` is in the future
 *                     activeSessions:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
statsRouter.get('/', getAdminStats);
