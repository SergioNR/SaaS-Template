import { prisma } from '../config/prismaClient.js';

//* Called right after a successful req.login so the session row keeps a real
//* user_id column instead of relying on matching the serialized JSON blob.
//* Throws on failure: a session without user_id could never be revoked by
//* deleteUserSessions, so the login must fail instead
export const linkSessionToUser = async (sessionId, userId) => {
  await prisma.session.update({
    where: {
      sid: sessionId,
    },
    data: {
      user_id: userId,
    },
  });
};

//* Storage hygiene for the expired-session job - the store already refuses an
//* expired session on read. One indexed delete (@@index([expiresAt])) instead
//* of the store's full-table prune. Errors propagate to runExclusiveCronTick
export const deleteExpiredSessionsInDb = async (now = new Date()) => {
  const deleteResult = await prisma.session.deleteMany({
    where: {
      expiresAt: {
        lt: now,
      },
    },
  });

  return deleteResult.count;
};

export const countActiveSessionsInDb = async () => {
  const activeSessionCount = await prisma.session.count({
    where: {
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return activeSessionCount;
};

//* Session counts only - the serialized `data` blob is sensitive and never
//* exposed through the admin API
export const countActiveSessionsByUserInDb = async (userId) => {
  const activeSessionCount = await prisma.session.count({
    where: {
      user_id: userId,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return activeSessionCount;
};

//* Transaction-aware revocation: `tx` is an interactive-transaction client,
//* so callers changing a credential (password update / reset) revoke the
//* sessions in the same commit as the credential write. Errors propagate
export const deleteUserSessionsInTx = async (tx, userId, exceptSessionId = null) => {
  const whereClause = {
    user_id: userId,
  };

  if (exceptSessionId) {
    whereClause.sid = {
      not: exceptSessionId,
    };
  }

  const deleteResult = await tx.session.deleteMany({
    where: whereClause,
  });

  return {
    deletedCount: deleteResult.count,
  };
};

//* Standalone revocation outside a transaction - throws on failure, callers
//* that want fire-and-forget semantics must catch themselves
export const deleteUserSessions = async (userId, exceptSessionId = null) => deleteUserSessionsInTx(prisma, userId, exceptSessionId);
