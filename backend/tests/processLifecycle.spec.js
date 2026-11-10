import { jest } from '@jest/globals';
import {
  isShuttingDown,
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
