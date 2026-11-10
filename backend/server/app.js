//* Must stay the first import - throws before any module reads
//* DEPLOY_ENVIRONMENT when production is booted in localhost mode
import './config/environmentGuard.js';
import { createServer } from 'http';
import { createApp } from './createApp.js';
import { startCronJobs, stopCronJobs } from './cron/jobsContainer.js';
import { prisma } from './config/prismaClient.js';
import { client as posthogClient } from './config/posthog-node.js';
import { logger } from './config/logger.js';
import { logError, logInfo, logWarn } from './config/loggerFunctions.js';
import { markShuttingDown, waitForBackgroundTasks } from './utils/processLifecycle.js';

//* Composition root: the app itself is built in createApp.js; this file only
//* binds it to a port, schedules the cron jobs and owns the process lifecycle
const app = createApp();
const server = createServer(app);

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
