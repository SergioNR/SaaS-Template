import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openapiSpecification } from '../config/swagger.js';

//* Mounted by app.js only when DEPLOY_ENVIRONMENT=localhost - deployed
//* environments never publish the API map
export const docsRouter = Router();

//* Interactive Swagger UI - served at /api/docs (assets served from /api/docs/*)
docsRouter.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpecification));

/**
 * @openapi
 * /api/docs.json:
 *   get:
 *     tags: [Docs]
 *     summary: Get the OpenAPI specification
 *     description: The raw OpenAPI 3 document that backs the interactive documentation at `/api/docs`. Local development only - deployed environments do not mount the docs router.
 *     responses:
 *       200:
 *         description: The OpenAPI specification
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
//* Raw OpenAPI specification in JSON format - served at /api/docs.json
docsRouter.get('/docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(openapiSpecification);
});

//* Scoped to the docs namespace: the router is mounted on /api before
//* apiRouter, so an unscoped fallback would swallow every API request
docsRouter.use('/docs/*fallback', (req, res) => {
  res.status(404).json({
    message: 'The requested route is not available or does not exist',
  });
});
