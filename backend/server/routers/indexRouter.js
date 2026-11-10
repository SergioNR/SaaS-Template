import { Router } from 'express';
import { getHealth } from '../controllers/healthController.js';

//* Mounted in app.js before the rate limiters and slow-down: orchestrator
//* probes poll frequently from a single IP and must never be throttled or
//* delayed into a false "unhealthy"
export const healthRouter = Router();

/**
 * @openapi
 * /health:
 *   get:
 *     tags: [Health]
 *     summary: Health check (database included)
 *     description: Returns 200 when the server is up and the database answers a `SELECT 1`, 503 otherwise - also once a graceful shutdown started, so traffic drains away from the replica. Not rate limited and not access-logged - intended for container/orchestrator health probes.
 *     responses:
 *       200:
 *         description: Server and database are healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [ok]
 *             example:
 *               status: ok
 *       503:
 *         description: Database unreachable, or the server is shutting down
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [unavailable]
 *             example:
 *               status: unavailable
 */
healthRouter.get('/', getHealth);

export const indexRouter = Router();

/**
 * @openapi
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Liveness check
 *     description: Returns whether the HTTP server is up. Does not touch the database - use `/health` for readiness.
 *     responses:
 *       200:
 *         description: Server is up
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessMessage'
 *             example:
 *               message: server is healthy
 */
indexRouter.get('/', (req, res) => {
  res.status(200).json({
    message: 'server is healthy',
  });
});

//* .all so non-GET misses get the JSON 404 too, not Express' HTML page
indexRouter.all('/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  }); //* Will catch failed requests even though they are authenticated & have the appropiate role
});
