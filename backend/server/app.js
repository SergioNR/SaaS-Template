//* Must stay the first import - throws before any module reads
//* DEPLOY_ENVIRONMENT when production is booted in localhost mode
import './config/environmentGuard.js';
import { createServer } from 'http';
import { createApp } from './createApp.js';
import { startCronJobs, stopCronJobs } from './cron/jobsContainer.js';
import { prisma } from './config/prismaClient.js';
import { client as posthogClient } from './config/posthog-node.js';
import { logger } from './config/logger.js';
import {
  logError, logInfo, logWarn, serializeError,
} from './config/loggerFunctions.js';
import { createCrashHandler, createGracefulShutdown } from './utils/processLifecycle.js';

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

//* Awaits the crash alert (3 s cap) before flushing and exiting 1; a second
//* crash event while waiting is logged only (see createCrashHandler)
const crashProcess = createCrashHandler({
  logError,
  logLine: (message, error) => logger.error({ message: message, context: { errorDetails: serializeError(error) } }),
  flushLogs,
  exit: (code) => process.exit(code),
});

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
//* In-flight requests, running cron ticks and detached work (emails,
//* registration, analytics) share most of that budget; what is still pending
//* afterwards is logged and abandoned
const DRAIN_TIMEOUT_MS = 8000;

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

const gracefulShutdown = createGracefulShutdown({
  stopCronJobs,
  closeServer,
  closeResources,
  flushLogs,
  exit: (code) => process.exit(code),
  logInfo,
  logWarn,
  logError,
  drainTimeoutMs: DRAIN_TIMEOUT_MS,
  shutdownTimeoutMs: SHUTDOWN_TIMEOUT_MS,
});

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
