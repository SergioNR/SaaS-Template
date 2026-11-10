import { prisma } from '../config/prismaClient.js';
import { INVITE_EXPIRY_DURATION_MS } from '../config/security.js';
import { logError } from '../config/loggerFunctions.js';
import { generateSecureToken, hashSecureToken } from '../utils/secureToken.js';

const inviteWithRelationsInclude = {
  Company: {
    select: {
      id: true,
      name: true,
    },
  },
  Role: true,
};

//* The digest never leaves the model - not even towards controllers
const inviteOmit = {
  token_hash: true,
};

//* Only invites whose token has not expired are pending - expired rows stay
//* until the nightly cleanup but must never block, list or count as pending
const pendingInviteWhere = () => ({
  token_expires: {
    gt: new Date(),
  },
});

//* Returns the created row together with the raw token. The raw token only
//* ever goes into the invite email; the row stores its sha256 digest.
//* An EXPIRED invite for the same company+email is replaced in the same
//* transaction; a pending one makes the create fail with P2002 (unique
//* company_id+email) - callers map it to 409
export const createTeamInviteInDb = async (inviteData) => {
  const {
    email,
    companyId,
    roleId,
    invitedBy,
  } = inviteData;

  const inviteToken = generateSecureToken();

  const createTeamInviteQuery = await prisma.$transaction(async (tx) => {
    await tx.teamInvites.deleteMany({
      where: {
        company_id: companyId,
        email,
        token_expires: {
          lte: new Date(),
        },
      },
    });

    return tx.teamInvites.create({
      data: {
        email,
        company_id: companyId,
        role_id: roleId,
        invited_by: invitedBy,
        token_hash: hashSecureToken(inviteToken),
        token_expires: new Date(Date.now() + INVITE_EXPIRY_DURATION_MS),
      },
      omit: inviteOmit,
    });
  });

  return {
    invite: createTeamInviteQuery,
    inviteToken,
  };
};

//* Rotation is a single UPDATE on the existing row, so it is atomic and the
//* invite id (the public handle for resend/revoke) never changes. The old
//* link stops working the moment the new digest is written. The original
//* inviter stays on the row - a resend never re-attributes the invite.
//* Returns null when the invite was revoked or accepted concurrently
export const rotateTeamInviteTokenInDb = async (inviteId, companyId) => {
  const inviteToken = generateSecureToken();

  try {
    const rotatedInvite = await prisma.teamInvites.update({
      where: {
        id: inviteId,
        company_id: companyId,
      },
      data: {
        token_hash: hashSecureToken(inviteToken),
        token_expires: new Date(Date.now() + INVITE_EXPIRY_DURATION_MS),
      },
      omit: inviteOmit,
    });

    return {
      invite: rotatedInvite,
      inviteToken,
    };
  } catch (error) {
    if (error.code === 'P2025') { //* Record to update not found
      return null;
    }

    throw error;
  }
};

export const getTeamInviteByTokenInDb = async (inviteToken) => {
  const getTeamInviteQuery = await prisma.teamInvites.findUnique({
    where: {
      token_hash: hashSecureToken(inviteToken),
    },
    include: inviteWithRelationsInclude,
    omit: inviteOmit,
  });

  return getTeamInviteQuery;
};

export const getTeamInviteByIdInDb = async (inviteId, companyId) => {
  //* Scoped by company so one company can never act on another's invites
  const getTeamInviteQuery = await prisma.teamInvites.findFirst({
    where: {
      id: inviteId,
      company_id: companyId,
    },
    include: {
      Role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    omit: inviteOmit,
  });

  return getTeamInviteQuery;
};

export const getPendingTeamInviteByCompanyAndEmailInDb = async (companyId, email) => {
  const getTeamInviteQuery = await prisma.teamInvites.findFirst({
    where: {
      company_id: companyId,
      email,
      ...pendingInviteWhere(),
    },
    omit: inviteOmit,
  });

  return getTeamInviteQuery;
};

export const getCompanyPendingInvitesInDb = async (companyId) => {
  const getCompanyInvitesQuery = await prisma.teamInvites.findMany({
    where: {
      company_id: companyId,
      ...pendingInviteWhere(),
    },
    include: {
      Role: {
        select: {
          name: true,
        },
      },
    },
    omit: inviteOmit,
    orderBy: [
      { created_at: 'desc' },
      { id: 'desc' },
    ],
  });

  return getCompanyInvitesQuery;
};

export const deleteTeamInviteInDb = async (inviteId, companyId) => {
  const deleteResult = await prisma.teamInvites.deleteMany({
    where: {
      id: inviteId,
      company_id: companyId,
    },
  });

  return deleteResult.count > 0;
};

export const deleteExpiredTeamInvites = async () => {
  const whereClause = {
    token_expires: {
      lt: new Date(),
    },
  };

  await prisma.teamInvites.deleteMany({
    where: whereClause,
  });
};

//* Non-throwing cleanup used by the invite-accept flow - a failed delete
//* must not flip an already-decided response into a 500
export const deleteTeamInviteByIdSafe = async (inviteId) => {
  try {
    await prisma.teamInvites.deleteMany({
      where: {
        id: inviteId,
      },
    });
  } catch (error) {
    logError(`Team invite ${inviteId} deletion failed`, error);
    // throw error //* NOT throwing an error since req-res
    //*  flow should not be interrupted with this cleanup operation
  }
};
