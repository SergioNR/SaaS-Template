//* Kept first like in app.js - the guard throws before any module reads
//* DEPLOY_ENVIRONMENT when production is booted in localhost mode
import './config/environmentGuard.js';
import express from 'express';
import passport from 'passport';
import { corsMiddleware } from './middlewares/cors.js';
import { helmetMiddleware } from './middlewares/helmet.js';
import { apiRouter } from './API/apiRouter.js';
import { storeSessions } from './middlewares/storeExpressSessions.js';
import { healthRouter, indexRouter } from './routers/indexRouter.js';
import { docsRouter } from './routers/docsRouter.js';
import { limiter } from './middlewares/express-rate-limiter.js';
import { slowLimiter } from './middlewares/express-slow-down.js';
import { checkOrigin } from './middlewares/originChecker.js';
import { checkJsonContentType } from './middlewares/jsonContentTypeChecker.js';
import { globalErrorHandler } from './middlewares/globalErrorHandler.js';
import { webhookRouter } from './webhooks/webhooksRouter.js';
import { webhookLimiter } from './webhooks/webhookRateLimiter.js';
import { trustProxySetting } from './config/trustProxy.js';
import { requestLogger } from './middlewares/requestLogger.js';

//* Builds the Express application - middleware order included - without
//* listening, starting cron jobs or installing process handlers (app.js does
//* that), so the HTTP-level integration specs can drive it with supertest.
//* The mount order below is a security contract: see the comments and
//* tests/appIntegration.spec.js
export const createApp = () => {
  const app = express();

  //* Trust exactly the reverse proxy hops declared in TRUST_PROXY so req.ip /
  //* req.protocol reflect the client and rate limits cannot be bypassed by
  //* forging X-Forwarded-For
  app.set('trust proxy', trustProxySetting);

  //* Middleware for ExpressJS securization
  app.use(helmetMiddleware);
  app.use(corsMiddleware);

  //* Access log + request id - mounted before every router (health, webhooks,
  //* docs, API) so every request gets an X-Request-Id and one access line.
  //* pino-http logs at response finish, after the session middlewares further
  //* down populated req.user, so the user id is included. /health polling is
  //* excluded inside requestLogger
  app.use(requestLogger());

  //* Health probe - mounted before every limiter so orchestrator polling is
  //* never throttled, and before sessions/body parsing so it stays cheap
  app.use('/health', healthRouter);

  //* Webhooks router - mounted before the global rate limiters (Stripe retries
  //* must not be throttled - it gets its own generous budget instead), before
  //* the Origin check (Stripe sends no Origin header) and before express.json()
  //* (signature verification needs the raw body)
  app.use('/webhooks', webhookLimiter, webhookRouter);

  //* API documentation (Swagger UI + raw OpenAPI spec) - local development
  //* only, deployed environments do not publish the API map. Mounted before
  //* the rate limiters so the documentation static assets are not throttled
  if (process.env.DEPLOY_ENVIRONMENT === 'localhost') app.use('/api', docsRouter);

  //* Global limiter first so requests over budget are rejected immediately
  //* instead of being held by the slow-down delay
  if (process.env.DEPLOY_ENVIRONMENT !== 'localhost') app.use(limiter);
  if (process.env.DEPLOY_ENVIRONMENT !== 'localhost') app.use(slowLimiter);

  //* CSRF protection - state-changing requests must come from an allowed origin
  app.use(checkOrigin());

  //* Only JSON bodies are accepted on the API (no urlencoded/form parsing, so
  //* cross-site HTML forms cannot submit to it)
  app.use('/api', checkJsonContentType());
  app.use(express.json());

  //* Middleware to store sessions in DB
  app.use(storeSessions);

  app.use(passport.session());

  //* Router selectors

  app.use('/api/', apiRouter);
  app.use('/', indexRouter);

  //* Middleware to catch & handle errors
  app.use(globalErrorHandler);

  return app;
};
