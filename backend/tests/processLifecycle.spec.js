import { jest } from '@jest/globals';
import {
  createCrashHandler,
  createGracefulShutdown,
  isShuttingDown,
  raceWithTimeout,
  markShuttingDown,
  pendingBackgroundTaskCount,
  resetProcessLifecycle,
  trackBackground,
  waitForBackgroundTasks,
} from '../server/utils/processLifecycle.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe('processLifecycle', () => {
  beforeEach(() => {
    resetProcessLifecycle();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('flags the shutdown once marked', () => {
    expect(isShuttingDown()).toBe(false);

    markShuttingDown();

    expect(isShuttingDown()).toBe(true);
  });

  it('tracks a background promise until it settles', async () => {
    const task = deferred();

    trackBackground(task.promise);
    expect(pendingBackgroundTaskCount()).toBe(1);

    task.resolve();
    await waitForBackgroundTasks(1000);

    expect(pendingBackgroundTaskCount()).toBe(0);
  });

  it('never lets a rejected task escape as an unhandled rejection', async () => {
    const task = deferred();

    expect(trackBackground(task.promise)).toBeUndefined();
    task.reject(new Error('swallowed'));

    await expect(waitForBackgroundTasks(1000)).resolves.toBe(true);
    expect(pendingBackgroundTaskCount()).toBe(0);
  });

  it('accepts non-promise values (a mocked fire-and-forget function)', async () => {
    trackBackground(undefined);

    await expect(waitForBackgroundTasks(1000)).resolves.toBe(true);
  });

  it('resolves true immediately when nothing is pending', async () => {
    await expect(waitForBackgroundTasks(1000)).resolves.toBe(true);
  });

  it('resolves true once every pending task settled', async () => {
    const first = deferred();
    const second = deferred();
    trackBackground(first.promise);
    trackBackground(second.promise);

    const waiting = waitForBackgroundTasks(1000);
    first.resolve();
    second.reject(new Error('boom'));

    await expect(waiting).resolves.toBe(true);
  });

  it('gives up after the timeout and reports it', async () => {
    jest.useFakeTimers();
    trackBackground(new Promise(() => {}));

    const waiting = waitForBackgroundTasks(5000);
    jest.advanceTimersByTime(5000);

    await expect(waiting).resolves.toBe(false);
    expect(pendingBackgroundTaskCount()).toBe(1);
  });
});

describe('raceWithTimeout', () => {
  //* Fake timers throughout: once an earlier spec restored real timers the
  //* ESM test realm has no global setTimeout left
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resolves true when the promise settles first - fulfilled or rejected', async () => {
    await expect(raceWithTimeout(Promise.resolve('x'), 1000)).resolves.toBe(true);
    await expect(raceWithTimeout(Promise.reject(new Error('x')), 1000)).resolves.toBe(true);
  });

  it('resolves false when the timeout wins', async () => {
    jest.useFakeTimers();

    const racing = raceWithTimeout(new Promise(() => {}), 3000);
    jest.advanceTimersByTime(3000);

    await expect(racing).resolves.toBe(false);
  });

  it('keeps its timer ref\'d unless asked otherwise', async () => {
    const unrefSpy = jest.fn();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout').mockImplementation(() => ({ unref: unrefSpy }));

    try {
      raceWithTimeout(new Promise(() => {}), 10);
      expect(unrefSpy).not.toHaveBeenCalled();

      raceWithTimeout(new Promise(() => {}), 10, { unref: true });
      expect(unrefSpy).toHaveBeenCalledTimes(1);
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });
});

describe('createCrashHandler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const setup = (alertPromise) => {
    const deps = {
      logError: jest.fn(() => alertPromise),
      logLine: jest.fn(),
      flushLogs: jest.fn(),
      exit: jest.fn(),
    };

    return { deps, crash: createCrashHandler(deps) };
  };

  it('exits 1 only after the alert settled, then flushes', async () => {
    const alert = deferred();
    const { deps, crash } = setup(alert.promise);

    const crashing = crash('Uncaught exception - crashing', new Error('boom'));
    await Promise.resolve();

    expect(deps.logError).toHaveBeenCalledWith('Uncaught exception - crashing', expect.any(Error));
    expect(deps.exit).not.toHaveBeenCalled();

    alert.resolve();
    await crashing;

    expect(deps.flushLogs).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('exits after 3 s when the alert hangs', async () => {
    jest.useFakeTimers();
    const { deps, crash } = setup(new Promise(() => {}));

    const crashing = crash('Unhandled promise rejection - crashing', new Error('boom'));
    await jest.advanceTimersByTimeAsync(2999);
    expect(deps.exit).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);
    await crashing;

    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  it('logs a second crash event without waiting or exiting again', async () => {
    const alert = deferred();
    const { deps, crash } = setup(alert.promise);

    const first = crash('first', new Error('a'));
    await crash('second', new Error('b'));

    expect(deps.logError).toHaveBeenCalledTimes(1);
    expect(deps.logLine).toHaveBeenCalledWith('second', expect.any(Error));
    expect(deps.exit).not.toHaveBeenCalled();

    alert.resolve();
    await first;

    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
});

describe('createGracefulShutdown', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetProcessLifecycle();
  });

  afterEach(() => {
    jest.useRealTimers();
    resetProcessLifecycle();
  });

  const setup = ({ cronDrain = Promise.resolve([]) } = {}) => {
    const order = [];
    const deps = {
      stopCronJobs: jest.fn(() => {
        order.push('stopCronJobs');
        return cronDrain.then((value) => {
          order.push('cronDrained');
          return value;
        });
      }),
      closeServer: jest.fn(async () => { order.push('serverClosed'); }),
      closeResources: jest.fn(async () => { order.push('resourcesClosed'); }),
      flushLogs: jest.fn(),
      exit: jest.fn((code) => { order.push(`exit:${code}`); }),
      logInfo: jest.fn(),
      logWarn: jest.fn(),
      logError: jest.fn(),
      drainTimeoutMs: 8000,
      shutdownTimeoutMs: 10000,
    };

    return { deps, order, shutdown: createGracefulShutdown(deps) };
  };

  it('marks the process draining, stops cron and closes resources only after the running tick finished', async () => {
    jest.useFakeTimers();
    const tick = deferred();
    const { deps, order, shutdown } = setup({ cronDrain: tick.promise });

    const shuttingDown = shutdown('SIGTERM');

    expect(isShuttingDown()).toBe(true);
    expect(deps.stopCronJobs).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(3000);
    expect(deps.closeResources).not.toHaveBeenCalled();

    tick.resolve([]);
    await shuttingDown;

    expect(order.indexOf('cronDrained')).toBeLessThan(order.indexOf('resourcesClosed'));
    expect(order.at(-1)).toBe('exit:0');
    expect(deps.logWarn).not.toHaveBeenCalled();
  });

  it('abandons a tick that outlives the drain budget with a warning, then closes resources', async () => {
    jest.useFakeTimers();
    const { deps, order, shutdown } = setup({ cronDrain: new Promise(() => {}) });

    const shuttingDown = shutdown('SIGTERM');
    await jest.advanceTimersByTimeAsync(8000);
    await shuttingDown;

    expect(deps.logWarn).toHaveBeenCalledWith('Cron tick still running at shutdown - abandoning it');
    expect(order).toContain('resourcesClosed');
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('waits for tracked background work under the same deadline', async () => {
    const email = deferred();
    trackBackground(email.promise);
    const { deps, shutdown } = setup();

    const shuttingDown = shutdown('SIGTERM');
    await Promise.resolve();
    expect(deps.closeResources).not.toHaveBeenCalled();

    email.resolve();
    await shuttingDown;

    expect(deps.closeResources).toHaveBeenCalledTimes(1);
  });

  it('ignores a repeated signal', async () => {
    const { deps, shutdown } = setup();

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGTERM')]);

    expect(deps.stopCronJobs).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });
});
