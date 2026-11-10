import { prisma } from '../config/prismaClient.js';

//* Long enough for the slowest job (bucket deletes of stale uploads); the
//* transaction only holds the lock, the task's own queries run outside it
const DEFAULT_LOCK_HOLD_TIMEOUT_MS = 10 * 60 * 1000;

//* Runs `task` only when this process wins the advisory lock `lockKey`, and
//* skips it otherwise (another replica holds it). The lock is
//* transaction-scoped (`pg_try_advisory_xact_lock`): a session-level lock
//* taken through the pooled client could be released on a different
//* connection than it was taken on, while the transaction pins one
//* connection and Postgres releases the lock with it - even if the process
//* dies mid-task.
//* Resolves to { acquired: false } or { acquired: true, result }
export const runWithAdvisoryLockInDb = async (lockKey, task, options = {}) => {
  const { timeoutMs = DEFAULT_LOCK_HOLD_TIMEOUT_MS } = options;

  return prisma.$transaction(async (tx) => {
    const [{ acquired }] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(${lockKey}::bigint) AS "acquired"`;

    if (!acquired) {
      return { acquired: false };
    }

    const result = await task();

    return { acquired: true, result };
  }, {
    timeout: timeoutMs,
  });
};
