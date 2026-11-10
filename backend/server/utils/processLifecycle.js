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

//* Resolves true when every task registered so far settled, false when the
//* timeout won. The timer is unref'd so it never keeps the process alive
export const waitForBackgroundTasks = async (timeoutMs) => {
  if (pendingTasks.size === 0) {
    return true;
  }

  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref?.();
  });

  const drained = Promise.allSettled([...pendingTasks]).then(() => true);

  const result = await Promise.race([drained, timeout]);

  clearTimeout(timer);

  return result;
};

//* Spec helper - module state otherwise leaks between test cases
export const resetProcessLifecycle = () => {
  shuttingDown = false;
  pendingTasks.clear();
};
