//* Must stay the first import - throws before any module reads
//* DEPLOY_ENVIRONMENT when production is booted in localhost mode
import './config/environmentGuard.js';
import express from 'express';
import passport from 'passport';
import { createServer } from 'http';
import { cookieParserMiddleware } from './middlewares/cookieParser.js';
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
import { startCronJobs, stopCronJobs } from './cron/jobsContainer.js';
import { globalErrorHandler } from './middlewares/globalErrorHandler.js';
import { webhookRouter } from './webhooks/webhooksRouter.js';
import { webhookLimiter } from './webhooks/webhookRateLimiter.js';
import { trustProxySetting } from './config/trustProxy.js';
import { prisma } from './config/prismaClient.js';
import { client as posthogClient } from './config/posthog-node.js';
import { logger } from './config/logger.js';
import { logError, logInfo, logWarn } from './config/loggerFunctions.js';
import { markShuttingDown, waitForBackgroundTasks } from './utils/processLifecycle.js';
import { requestLogger } from './middlewares/requestLogger.js';

const app = express();
const server = createServer(app);

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

app.use(cookieParserMiddleware);

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

//* Start the server
const PORT = Number.parseInt(process.env.PORT, 10);

if (!Number.isInteger(PORT) || PORT <= 0) {
  logWarn('PORT environment variable is not set or invalid - defaulting to 3000');
}

const listenPort = Number.isInteger(PORT) && PORT > 0 ? PORT : 3000;

server.listen(listenPort, () => {
  logInfo(`Server running on port ${listenPort}`);
});

startCronJobs();

//* Best-effort flush of the transport worker buffer (Better Stack) before an
//* exit - losing the last log line must never block or break a shutdown
const flushLogs = () => {
  try {
    logger.flush();
  } catch {
    // Fail silently
  }
};

const crashProcess = (message, error) => {
  logError(message, error);
  flushLogs();
  process.exit(1);
};

//* Node's default for both events is to crash with a bare stderr print - keep
//* the crash semantics (the process state is unknown afterwards) but log the
//* cause through pino/Telegram first
process.on('unhandledRejection', (reason) => {
  crashProcess('Unhandled promise rejection - crashing', reason);
});

process.on('uncaughtException', (error) => {
  crashProcess('Uncaught exception - crashing', error);
});

//* Hard ceiling for the whole shutdown - container runtimes SIGKILL shortly
//* after SIGTERM (Docker: 10 s by default)
const SHUTDOWN_TIMEOUT_MS = 10000;
//* Detached work (emails, registration, analytics) gets most of that budget;
//* what is still pending afterwards is logged and abandoned
const BACKGROUND_TASKS_DRAIN_TIMEOUT_MS = 8000;
let isShuttingDown = false;

const closeResources = async () => {
  const results = await Promise.allSettled([
    posthogClient.shutdown(), //* Flush queued analytics events
    prisma.$disconnect(),
  ]);

  results
    .filter((result) => result.status === 'rejected')
    .forEach((result) => logError('Error closing resources during shutdown', result.reason));
};

const closeServer = () => new Promise((resolve) => {
  server.close(() => resolve());
});

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  //* /health answers 503 from here on so traffic drains away from this replica
  markShuttingDown();

  logInfo(`Received ${signal}, closing server`);

  stopCronJobs();

  //* Force shutdown after timeout - unref'd so it never keeps the process alive
  setTimeout(() => {
    logError('Could not close connections in time, forcefully shutting down', new Error('Shutdown timeout'));
    flushLogs();
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  //* In-flight requests and detached background work drain in parallel;
  //* resources (database, PostHog) close only once both are done, because the
  //* background tasks still use them
  const [, backgroundDrained] = await Promise.all([
    closeServer(),
    waitForBackgroundTasks(BACKGROUND_TASKS_DRAIN_TIMEOUT_MS),
  ]);

  if (!backgroundDrained) {
    logWarn('Background tasks still pending at shutdown - abandoning them');
  }

  await closeResources();
  logInfo('Server closed gracefully');
  flushLogs();
  process.exit(0);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
