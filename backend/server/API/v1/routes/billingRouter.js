import { Router } from 'express';
import { checkSchema } from 'express-validator';
import {
  createCompanyBillingId,
  getBillingCustomerPortalUrl,
  getBillingCheckoutSessionUrl,
  getCompanySubscriptionData,
} from '../../../controllers/billingController.js';
import { sanitizerResult } from '../../../middlewares/sanitizerResult.js';
import { checkCompanyPermission } from '../../../middlewares/companyPermissionChecker.js';
import { checkoutSessionSchema } from '../../../utils/validators/checkoutSessionSchema.js';

export const billingRouter = Router();

//* Authentication, the platform role and company membership are checked at the apiRouter mounting level.
//* Reading the subscription status is open to every company member; anything
//* that creates Stripe objects requires the `billing.manage` company permission
const requireBillingManage = checkCompanyPermission('billing.manage');

/**
 * @openapi
 * /api/v1/billing:
 *   get:
 *     tags: [Billing]
 *     summary: Get the subscription data of the user's company
 *     description: Readable by every member of the company - no company permission required.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Subscription data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptionData:
 *                   type: object
 *                   description: Subscription fields only - internal Stripe ids are never exposed
 *                   properties:
 *                     is_paid:
 *                       type: boolean
 *                       description: Whether the row is a real Stripe subscription - the free trial row is not. The subscription id itself is never exposed
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                     has_billing_id:
 *                       type: boolean
 *                       description: Whether the company has a Stripe customer id - false until the first checkout session is started
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: No subscription found for the company
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
billingRouter.get('/', getCompanySubscriptionData);

/**
 * @openapi
 * /api/v1/billing:
 *   post:
 *     tags: [Billing]
 *     summary: Create a Stripe customer for the user's company
 *     description: Creates a Stripe customer id for the logged-in user's company and stores it. Fails if the company already has a billing id. Requires the `billing.manage` company permission.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       201:
 *         description: Billing id created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Missing the `billing.manage` company permission
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: Company already has a billing id
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
billingRouter.post('/', requireBillingManage, createCompanyBillingId);

/**
 * @openapi
 * /api/v1/billing/checkout-session:
 *   post:
 *     tags: [Billing]
 *     summary: Create a Stripe checkout session
 *     description: Returns the URL of a Stripe checkout session for the user's company. The Stripe customer is created on first use. When the customer already has an open session for the same plan, billing cycle and price, that session's URL is returned (a double-submit or second tab lands on the same checkout); every other open session is expired, so at most one checkout can complete. Refused while the company has an active, trialing or past-due Stripe subscription. Requires the `billing.manage` company permission.
 *     security:
 *       - sessionCookie: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               planName:
 *                 type: string
 *                 enum: [basic, pro]
 *                 description: Name of the plan to subscribe to
 *               planBillingCycle:
 *                 type: string
 *                 enum: [monthly, yearly]
 *                 description: Billing cycle of the plan
 *     responses:
 *       200:
 *         description: Checkout session URL - a reused open session or a new one
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 checkoutSessionUrl:
 *                   type: string
 *                   format: uri
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Missing the `billing.manage` company permission
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: The company already has an active Stripe subscription (`code` = `SUBSCRIPTION_ACTIVE`) - manage or change it through the customer portal instead; or a concurrent checkout request for the company is still in progress at Stripe (`code` = `CHECKOUT_IN_PROGRESS`) - retry
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 code:
 *                   type: string
 *                   enum: [SUBSCRIPTION_ACTIVE, CHECKOUT_IN_PROGRESS]
 *       422:
 *         description: Validation errors - unknown plan or billing cycle
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ValidationError'
 */
billingRouter.post('/checkout-session', requireBillingManage, checkSchema(checkoutSessionSchema), sanitizerResult, getBillingCheckoutSessionUrl);

/**
 * @openapi
 * /api/v1/billing/customer-portal:
 *   post:
 *     tags: [Billing]
 *     summary: Create a Stripe customer portal session
 *     description: Creates a Stripe customer portal session for the user's company and returns its URL for managing the subscription. Works whenever the company has a Stripe customer, including after the subscription ended. Requires the `billing.manage` company permission.
 *     security:
 *       - sessionCookie: []
 *     responses:
 *       200:
 *         description: Customer portal URL retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customerPortalUrl:
 *                   type: string
 *                   format: uri
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Missing the `billing.manage` company permission
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 *       409:
 *         description: Company has no billing id yet - start a checkout first
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorMessage'
 */
billingRouter.post('/customer-portal', requireBillingManage, getBillingCustomerPortalUrl);

billingRouter.use('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
