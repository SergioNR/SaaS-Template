//* Process-wide lifecycle state shared by the graceful shutdown in app.js,
//* the health probe and the fire-and-forget call sites

let shuttingDown = false;

//* Once set, GET /health answers 503 so the orchestrator / load balancer
//* stops routing new traffic to this replica while it drains
export const markShuttingDown = () => {
  shuttingDown = true;
};

export const isShuttingDown = () => shuttingDown;

//* Fire-and-forget work (detached registration, reset/invite emails,
//* PostHog events, last-login updates) runs after the response was sent. A
//* SIGTERM must not cut it off mid-way, so every such promise is registered
//* here and the shutdown waits (bounded) for the set to drain
const pendingTasks = new Set();

//* Returns nothing on purpose: the tracked promise never rejects (a failure
//* is the task's own business - they all swallow and log their errors), so a
//* stray rejection can never reach the unhandledRejection crash handler
export const trackBackground = (promise) => {
  const tracked = Promise.resolve(promise)
    .catch(() => {})
    .finally(() => {
      pendingTasks.delete(tracked);
    });

  pendingTasks.add(tracked);
};

export const pendingBackgroundTaskCount = () => pendingTasks.size;

//* Resolves true once `promise` settled (fulfilled or rejected - the outcome
//* is the caller's business), false when `timeoutMs` passed first. The timer
//* is cleared either way. `unref: true` lets the process exit while waiting
//* (shutdown drains, where the hard ceiling exits anyway); leave it false
//* when the wait itself must keep the process alive (the crash alert)
export const raceWithTimeout = async (promise, timeoutMs, { unref = false } = {}) => {
  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);

    if (unref) {
      timer.unref?.();
    }
  });

  const settled = Promise.resolve(promise).then(() => true, () => true);

  const result = await Promise.race([settled, timeout]);

  clearTimeout(timer);

  return result;
};

//* Resolves true when every task registered so far settled, false when the
//* timeout won. The timer is unref'd so it never keeps the process alive
export const waitForBackgroundTasks = async (timeoutMs) => {
  if (pendingTasks.size === 0) {
    return true;
  }

  return raceWithTimeout(Promise.allSettled([...pendingTasks]), timeoutMs, { unref: true });
};

//* The crash alert is the most alert-worthy event the API has, but exiting
//* synchronously kills its in-flight Telegram request - so the handler waits
//* for it, bounded below the 5 s Telegram timeout. Later crash events while
//* waiting are logged (pino) but neither extend the wait nor exit twice.
//* Dependencies are injected so the spec can drive it without a real exit
export const CRASH_ALERT_TIMEOUT_MS = 3000;

export const createCrashHandler = ({
  logError,
  logLine,
  flushLogs,
  exit,
  alertTimeoutMs = CRASH_ALERT_TIMEOUT_MS,
}) => {
  let crashing = false;

  return async (message, error) => {
    if (crashing) {
      logLine(message, error);
      return;
    }

    crashing = true;

    await raceWithTimeout(logError(message, error), alertTimeoutMs);

    flushLogs();
    exit(1);
  };
};

//* Graceful shutdown: stop scheduling cron, then drain in-flight requests,
//* running cron ticks and tracked background work in parallel under ONE
//* deadline, and close the resources (database, PostHog) only afterwards -
//* every one of them may still be using those. Whatever is still running
//* when the drain budget ends is logged and abandoned (a cron tick's
//* advisory-lock transaction rolls back on disconnect, and every job is
//* idempotent). A hard ceiling exits 1 if even that hangs
export const createGracefulShutdown = ({
  stopCronJobs,
  closeServer,
  closeResources,
  flushLogs,
  exit,
  logInfo,
  logWarn,
  logError,
  drainTimeoutMs,
  shutdownTimeoutMs,
}) => {
  let started = false;

  return async (signal) => {
    if (started) return;
    started = true;

    //* /health answers 503 from here on so traffic drains away from this replica
    markShuttingDown();

    logInfo(`Received ${signal}, closing server`);

    //* Force shutdown after timeout - unref'd so it never keeps the process alive
    setTimeout(() => {
      logError('Could not close connections in time, forcefully shutting down', new Error('Shutdown timeout'));
      flushLogs();
      exit(1);
    }, shutdownTimeoutMs).unref?.();

    //* Called first and synchronously: stop() clears every job's timer at
    //* once, so no new tick starts, and returns the running ticks' drain
    const cronDrain = stopCronJobs();

    const [, backgroundDrained, cronDrained] = await Promise.all([
      closeServer(),
      waitForBackgroundTasks(drainTimeoutMs),
      raceWithTimeout(cronDrain, drainTimeoutMs, { unref: true }),
    ]);

    if (!backgroundDrained) {
      logWarn('Background tasks still pending at shutdown - abandoning them');
    }

    if (!cronDrained) {
      logWarn('Cron tick still running at shutdown - abandoning it');
    }

    await closeResources();
    logInfo('Server closed gracefully');
    flushLogs();
    exit(0);
  };
};

//* Spec helper - module state otherwise leaks between test cases
export const resetProcessLifecycle = () => {
  shuttingDown = false;
  pendingTasks.clear();
};
