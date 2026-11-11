import { prisma } from '../config/prismaClient.js';
import { logInfo } from '../config/loggerFunctions.js';
import { generateSecureToken, hashSecureToken } from '../utils/secureToken.js';
import { deleteUserSessionsInTx } from './sessionModel.js';
import { deleteUserEmailVerificationTokensInTx } from './emailVerificationTokensModel.js';

const PASSWORD_RESET_TOKEN_TTL_MS = 3600000; // 1 hour

//* Returns the raw token - it only ever goes into the reset email; the row
//* stores its sha256 digest
export const createPasswordResetToken = async (userId) => {
  const passwordResetToken = generateSecureToken();

  //* Invalidate previous tokens so only the most recently requested link is
  //* usable - both writes commit together
  await prisma.$transaction([
    prisma.passwordResetTokens.deleteMany({
      where: {
        user_id: userId,
      },
    }),
    prisma.passwordResetTokens.create({
      data: {
        user_id: userId,
        token_hash: hashSecureToken(passwordResetToken),
        token_expires: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
      },
    }),
  ]);

  logInfo('Password reset token created', { userData: { userId } });

  return passwordResetToken;
};

//* Transaction-aware revocation of every reset token of a user - called from
//* the credential-changing transactions so a changed password and its
//* outstanding reset links can never outlive each other
export const deleteUserPasswordResetTokensInTx = async (tx, userId) => {
  const deleteResult = await tx.passwordResetTokens.deleteMany({
    where: {
      user_id: userId,
    },
  });

  return {
    deletedCount: deleteResult.count,
  };
};

export const getPasswordResetTokenData = async (token) => {
  const getPasswordResetTokenDataQuery = await prisma.passwordResetTokens.findUnique({
    where: {
      token_hash: hashSecureToken(token),
    },
    select: {
      user_id: true,
      token_expires: true,
    },
  });

  return getPasswordResetTokenDataQuery;
};

//* Single-use consumption + password change in one transaction. The token is
//* consumed with a conditional delete (matching digest AND not expired): two
//* concurrent resets with the same link serialize on the row lock and only
//* one of them sees count === 1. Every other reset token and every session
//* of the user are revoked in the same commit. Returns null when the token is
//* unknown, expired or already used; errors are thrown, never swallowed
export const resetUserPasswordWithTokenInDb = async (token, hashedPassword) => {
  const tokenHash = hashSecureToken(token);

  return prisma.$transaction(async (tx) => {
    const tokenRow = await tx.passwordResetTokens.findUnique({
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

    const consumeResult = await tx.passwordResetTokens.deleteMany({
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

    await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        password: hashedPassword,
      },
    });

    //* Completing a reset proves mailbox control - it verifies (claims) an
    //* unverified account in the same commit as the new password. Conditional
    //* so the original verification time of a verified account is kept
    await tx.user.updateMany({
      where: {
        id: userId,
        email_verified_at: null,
      },
      data: {
        email_verified_at: new Date(),
      },
    });

    await deleteUserEmailVerificationTokensInTx(tx, userId);

    await deleteUserPasswordResetTokensInTx(tx, userId);

    //* The old credential is no longer valid - every active session goes
    await deleteUserSessionsInTx(tx, userId);

    return { userId };
  });
};

export const deleteExpiredPasswordResetTokens = async () => {
  const whereClause = {
    token_expires: {
      lt: new Date(),
    },
  };

  await prisma.passwordResetTokens.deleteMany({
    where: whereClause,
  });
};
