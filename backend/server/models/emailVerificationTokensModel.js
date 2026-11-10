import { prisma } from '../config/prismaClient.js';
import { logInfo } from '../config/loggerFunctions.js';
import { generateSecureToken, hashSecureToken } from '../utils/secureToken.js';

export const EMAIL_VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

//* Returns the raw token - it only ever goes into the verification email; the
//* row stores its sha256 digest. Earlier tokens of the user are deleted in the
//* same commit so only the newest link verifies
export const createEmailVerificationTokenInDb = async (userId) => {
  const emailVerificationToken = generateSecureToken();

  await prisma.$transaction([
    prisma.emailVerificationTokens.deleteMany({
      where: {
        user_id: userId,
      },
    }),
    prisma.emailVerificationTokens.create({
      data: {
        user_id: userId,
        token_hash: hashSecureToken(emailVerificationToken),
        token_expires: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_MS),
      },
    }),
  ]);

  logInfo('Email verification token created', { userData: { userId } });

  return emailVerificationToken;
};

//* Transaction-aware revocation - used by the reset completion (which also
//* verifies the account) so no stale verification link outlives it
export const deleteUserEmailVerificationTokensInTx = async (tx, userId) => {
  const deleteResult = await tx.emailVerificationTokens.deleteMany({
    where: {
      user_id: userId,
    },
  });

  return {
    deletedCount: deleteResult.count,
  };
};

//* Single-use consumption + verification in one transaction: the token is
//* consumed with a conditional delete (matching digest AND not expired), so
//* two concurrent submissions of one link serialize on the row and only one
//* sees count === 1. The user update is conditional too (`updateMany`): an
//* account deleted concurrently (purge, invite claim) resolves to null, never
//* a P2025. Resolves to { userId } or null (unknown, expired or used token)
export const consumeEmailVerificationTokenInDb = async (token) => {
  const tokenHash = hashSecureToken(token);

  return prisma.$transaction(async (tx) => {
    const tokenRow = await tx.emailVerificationTokens.findUnique({
      where: {
        token_hash: tokenHash,
      },
      select: {
        user_id: true,
      },
    });

    if (!tokenRow) {
      return null;
    }

    const consumeResult = await tx.emailVerificationTokens.deleteMany({
      where: {
        token_hash: tokenHash,
        token_expires: {
          gt: new Date(),
        },
      },
    });

    if (consumeResult.count !== 1) {
      return null;
    }

    const { user_id: userId } = tokenRow;

    const verifyResult = await tx.user.updateMany({
      where: {
        id: userId,
        email_verified_at: null,
      },
      data: {
        email_verified_at: new Date(),
      },
    });

    if (verifyResult.count !== 1) {
      //* Already verified (e.g. by a password reset) - the link is spent
      //* either way; nothing else to roll back
      return null;
    }

    await deleteUserEmailVerificationTokensInTx(tx, userId);

    return { userId };
  });
};

export const deleteExpiredEmailVerificationTokensInDb = async () => {
  const deleteResult = await prisma.emailVerificationTokens.deleteMany({
    where: {
      token_expires: {
        lt: new Date(),
      },
    },
  });

  return deleteResult.count;
};
