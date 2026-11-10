import { prisma } from '../config/prismaClient.js';
import { listPaginationArgs } from '../utils/cursorPagination.js';
import { posthogUserDeleteAccount, posthogUserSignedUp } from './posthogModel.js';
import { FREE_TRIAL_DURATION_MS } from '../config/security.js';
import {
  logError,
  logInfo,
} from '../config/loggerFunctions.js';
import { lockCompanyForUpdateInDb } from './companyModel.js';
import { ADVISORY_LOCK_KEYS } from '../config/advisoryLockKeys.js';
import { deleteUserSessionsInTx } from './sessionModel.js';
import { deleteUserPasswordResetTokensInTx } from './passwordResetTokensModel.js';
import { hashSecureToken } from '../utils/secureToken.js';
import { canGrantRole, outranksAllRoles, rolesGrantableBy } from '../utils/companyRoleHierarchy.js';

const COMPANY_OWNER_ROLE = 'company_owner';

//* The caller's roles are only meaningful while they are still a member of
//* the company - resolves to null when they are not (removed concurrently)
const getMemberRoleNamesInTx = async (tx, userId, companyId) => {
  const member = await tx.user.findFirst({
    where: {
      id: userId,
      company_id: companyId,
    },
    select: {
      UserRoles: {
        select: {
          Role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!member) {
    return null;
  }

  return member.UserRoles.map((userRole) => userRole.Role.name);
};

const countCompanyOwnersInTx = (tx, companyId) => tx.user.count({
  where: {
    company_id: companyId,
    UserRoles: {
      some: {
        Role: {
          name: COMPANY_OWNER_ROLE,
        },
      },
    },
  },
});

//* Resolves to true while the member still belongs to the company and can
//* grant the role. Shared by the invite check/accept and the invite resend:
//* an invite is only as good as its inviter, so once they left the company or
//* were demoted below the invited role the invite must not grant what they
//* could no longer grant themselves
export const canCompanyMemberGrantRoleInDb = async (memberId, companyId, roleName) => {
  //* Outside a transaction the client itself plays the `tx` role
  const memberRoleNames = await getMemberRoleNamesInTx(prisma, memberId, companyId);

  return Boolean(memberRoleNames) && canGrantRole(memberRoleNames, roleName);
};

//* Self-registration resolves to the created user. Invite acceptance resolves
//* to { status: 'created', user }, { status: 'inviter_invalid' } (the inviter
//* left or can no longer grant the role - the invite is voided) or
//* { status: 'invite_invalid' } (unknown, expired, already accepted or
//* revoked meanwhile)
export const createUserInDb = async (userData) => {
  const {
    username,
    password,
    companyId,
    roleId,
    roleName,
    invitedBy,
    inviteId,
    inviteToken,
    companyName,
  } = userData;

  //* Invite acceptance path: the user joins an existing company with the
  //* invited role - no nested company/subscription creation, no trial.
  //* The company row is locked first - the same lock role changes and member
  //* removals take - so the inviter re-check below sees committed role rows
  //* and a concurrent demotion or removal cannot slip in between the check
  //* and the user creation. The invite is then consumed with a conditional
  //* delete (matching id AND digest AND not expired) - two concurrent accepts
  //* of the same link serialize on the row and only one sees count === 1, so
  //* a link can never create an account twice nor stay usable after an
  //* acceptance
  if (companyId && roleId) {
    const acceptResult = await prisma.$transaction(async (tx) => {
      await lockCompanyForUpdateInDb(tx, companyId);

      const inviterRoleNames = await getMemberRoleNamesInTx(tx, invitedBy, companyId);

      if (!inviterRoleNames || !canGrantRole(inviterRoleNames, roleName)) {
        //* Voided in the same commit - a dead inviter cannot be revived by a
        //* later resend either
        await tx.teamInvites.deleteMany({
          where: {
            id: inviteId,
          },
        });

        return { status: 'inviter_invalid' };
      }

      const consumeResult = await tx.teamInvites.deleteMany({
        where: {
          id: inviteId,
          token_hash: hashSecureToken(inviteToken),
          token_expires: {
            gt: new Date(),
          },
        },
      });

      if (consumeResult.count !== 1) {
        return { status: 'invite_invalid' };
      }

      const user = await tx.user.create({
        data: {
          email: username,
          password,
          role: 'user',
          company_id: companyId,
          UserRoles: {
            create: {
              role_id: roleId,
            },
          },
        },
        omit: {
          password: true,
        },
      });

      return { status: 'created', user };
    });

    if (acceptResult.status !== 'created') {
      return acceptResult;
    }

    const { user: invitedUser } = acceptResult;

    logInfo(`User ${invitedUser.id} (${invitedUser.role}) created in DB via team invite`, invitedUser);

    posthogUserSignedUp(invitedUser); // Fire-and-forget

    return acceptResult;
  }

  //* Self-registration (onboarding) path: creates a brand-new company with a
  //* trial subscription in the same nested write, and the registrant - its
  //* first user - becomes its company owner
  const ownerRole = await prisma.role.findUnique({
    where: {
      name: COMPANY_OWNER_ROLE,
    },
  });

  if (!ownerRole) {
    //* Migrations seed the role - a missing row is a broken deployment, not
    //* a request error, so it surfaces as a clear 500 instead of a TypeError
    throw new Error(`Company owner role (${COMPANY_OWNER_ROLE}) not seeded - run the database migrations`);
  }

  const createUserInDbQuery = await prisma.user.create({
    data: {
      email: username,
      password: password,
      role: 'user',
      Company: {
        create: {
          name: companyName,
          Subscription: {
            create: {
              expires_at: new Date(Date.now() + FREE_TRIAL_DURATION_MS),
            },
          },
        },
      },
      UserRoles: {
        create: {
          role_id: ownerRole.id,
        },
      },
    },
    omit: {
      password: true,
    },
  });

  logInfo(`User ${createUserInDbQuery.id} (${createUserInDbQuery.role}) created in DB`, createUserInDbQuery);

  posthogUserSignedUp(createUserInDbQuery, { createdCompany: true, companyName }); // Fire-and-forget

  return createUserInDbQuery;
};

export const getUserByEmail = async (userEmail) => {
  const whereClause = {
    email: userEmail,
  };

  const getUserByEmailQuery = await prisma.user.findUnique({
    where: whereClause,
    omit: {
      password: true,
    },
  });

  return getUserByEmailQuery;
};

//* The ONLY email lookup that selects the password hash - used exclusively by
//* the passport local strategy, which drops the hash before handing the user
//* to the session layer
export const getUserForLogin = async (userEmail) => {
  const getUserForLoginQuery = await prisma.user.findUnique({
    where: {
      email: userEmail,
    },
    select: {
      id: true,
      email: true,
      role: true,
      company_id: true,
      password: true,
    },
  });

  return getUserForLoginQuery;
};

export const updateUserLastLoginDate = async (userId) => {
  try {
    const queryResult = await prisma.user.update({
      where: { id: userId },
      data: {
        last_login_at: new Date(),
      },
      omit: {
        password: true,
      },
    });

    return queryResult;
  } catch (error) {
    logError(`could not update last login date for userid ${userId}`, error);
    return null;
  }
};

export const getUserPassword = async (userId) => {
  const whereClause = {
    id: userId,
  };

  const getUserPasswordQuery = await prisma.user.findUnique({
    where: whereClause,
    select: {
      password: true,
    },
  });

  return getUserPasswordQuery;
};

export const getUserById = async (userId) => {
  const whereClause = {
    id: userId,
  };

  const getUserByIdQuery = await prisma.user.findUnique({
    where: whereClause,
    omit: {
      password: true,
    },
  });

  return getUserByIdQuery;
};

//* Admin detail shape - the user plus its related company and subscription.
//* The Stripe customer id never leaves the model: clients only receive a
//* derived `stripeLinked` boolean
export const getUserDetailInDb = async (userId) => {
  const userDetailQuery = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    omit: {
      password: true,
    },
    include: {
      Company: {
        select: {
          id: true,
          name: true,
          stripe_id: true,
          Subscription: {
            select: {
              id: true,
              created_at: true,
              updated_at: true,
              expires_at: true,
            },
          },
        },
      },
    },
  });

  if (!userDetailQuery) {
    return null;
  }

  const { Company, ...user } = userDetailQuery;

  return {
    ...user,
    company: Company
      ? {
        id: Company.id,
        name: Company.name,
        stripeLinked: Boolean(Company.stripe_id),
        //* The schema models Company -> Subscription as a list with a unique
        //* FK, so the include always returns an array of 0 or 1 rows
        subscription: Company.Subscription[0] ?? null,
      }
      : null,
  };
};

//* Password change + revocation in one commit: the new hash, the deletion of
//* every outstanding reset token and of every other session of the user land
//* together, so a failure can never leave a changed password with live
//* sessions (or the reverse). Errors propagate - nothing is swallowed here
export const updateUserPasswordInDb = async (userId, newPassword, options = {}) => {
  const { keepSessionId = null } = options;

  const updatedUser = await prisma.$transaction(async (tx) => {
    const updatePasswordQuery = await tx.user.update({
      where: { id: userId },
      data: {
        password: newPassword,
      },
      omit: {
        password: true,
      },
    });

    await deleteUserPasswordResetTokensInTx(tx, userId);

    await deleteUserSessionsInTx(tx, userId, keepSessionId);

    return updatePasswordQuery;
  });

  logInfo(`Password updated successfully for User ${userId}`);

  return updatedUser;
};

export const getAllUsersInDb = async (filters = {}, pagination = {}) => {
  const getAllUsersQuery = await prisma.user.findMany({
    where: filters,
    omit: {
      password: true,
    },
    include: {
      Company: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    //* Newest first with the id tiebreaker - the order the cursor walk relies on
    ...listPaginationArgs(pagination),
  });

  return getAllUsersQuery;
};

export const countUsersInDb = async (filters = {}) => {
  const userCount = await prisma.user.count({
    where: filters,
  });

  return userCount;
};

//* Every DB step of a user deletion in one transaction: the user row (its
//* UserRole and reset-token rows cascade), its sessions and - when it was the
//* last member - the company's subscription, invites and company row (File
//* rows cascade). Third-party cleanup (Stripe, S3) needs data that is gone
//* after the commit, so the subscription and file keys are returned for the
//* caller to act on AFTER the transaction succeeded.
//*
//* The company row lock serializes concurrent deletions/role changes of the
//* same company, so the last-owner and last-member checks cannot race.
//*
//* Options:
//* - companyId: only delete when the user belongs to this company
//* - protectLastOwner: refuse to delete the last company owner while other
//*   members remain (they would be left without anyone able to manage them)
//* - callerId: refuse unless the caller - a member of the same company whose
//*   role rows are re-read under the lock - outranks every role the user
//*   holds (a stale pre-check outside the lock can never be trusted)
//*
//* Resolves to { status: 'not_found' | 'last_owner' | 'last_superadmin' |
//* 'forbidden' } or
//* { status: 'deleted', deletedUser, companyDeleted, subscription, fileKeys }
//* (plus companyId and stripeCustomerId when the company was deleted)
export const deleteUserWithCompanyDataInDb = async (userId, options = {}) => {
  const {
    companyId,
    protectLastOwner = false,
    callerId,
  } = options;

  const deletionResult = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findFirst({
      where: {
        id: userId,
        ...(companyId ? { company_id: companyId } : {}),
      },
      select: {
        id: true,
        role: true,
        company_id: true,
      },
    });

    if (!user) {
      return { status: 'not_found' };
    }

    const { company_id: userCompanyId } = user;

    //* Superadmins belong to no company: no company lock, no owner checks and
    //* no company cleanup (`company_id: null` would match every superadmin).
    //* The platform must keep at least one superadmin - checked under a
    //* transaction-scoped advisory lock (superadmins have no company row to
    //* lock) so concurrent deletions of the last two cannot both pass it
    if (!userCompanyId) {
      if (user.role === 'superadmin') {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEYS.superadminDeletion}::bigint)`;

        //* A concurrent deletion of the same account may have committed
        //* while this one waited for the lock
        const stillExists = await tx.user.count({
          where: {
            id: userId,
          },
        });

        if (stillExists === 0) {
          return { status: 'not_found' };
        }

        const superadminCount = await tx.user.count({
          where: {
            role: 'superadmin',
          },
        });

        if (superadminCount <= 1) {
          return { status: 'last_superadmin' };
        }
      }

      const deletedUser = await tx.user.delete({
        where: {
          id: userId,
        },
        omit: {
          password: true,
        },
      });

      await tx.session.deleteMany({
        where: {
          user_id: userId,
        },
      });

      return {
        status: 'deleted',
        deletedUser,
        companyDeleted: false,
        subscription: null,
        fileKeys: [],
      };
    }

    await lockCompanyForUpdateInDb(tx, userCompanyId);

    //* Membership and role rows are re-read after the lock so they reflect
    //* committed changes - a concurrent removal of the same member resolves
    //* to not_found instead of a P2025 on the delete below
    const userRoleNames = await getMemberRoleNamesInTx(tx, userId, userCompanyId);

    if (!userRoleNames) {
      return { status: 'not_found' };
    }

    if (callerId) {
      const callerRoleNames = await getMemberRoleNamesInTx(tx, callerId, userCompanyId);

      if (!callerRoleNames || !outranksAllRoles(callerRoleNames, userRoleNames)) {
        return { status: 'forbidden' };
      }
    }

    if (protectLastOwner && userRoleNames.includes(COMPANY_OWNER_ROLE)) {
      const ownerCount = await countCompanyOwnersInTx(tx, userCompanyId);
      const memberCount = await tx.user.count({
        where: {
          company_id: userCompanyId,
        },
      });

      if (ownerCount <= 1 && memberCount > 1) {
        return { status: 'last_owner' };
      }
    }

    const deletedUser = await tx.user.delete({
      where: {
        id: userId,
      },
      omit: {
        password: true,
      },
    });

    await tx.session.deleteMany({
      where: {
        user_id: userId,
      },
    });

    //* Invites only stay valid while their inviter can still vouch for them
    await tx.teamInvites.deleteMany({
      where: {
        invited_by: userId,
      },
    });

    const remainingUsers = await tx.user.count({
      where: {
        company_id: userCompanyId,
      },
    });

    if (remainingUsers > 0) {
      return {
        status: 'deleted',
        deletedUser,
        companyDeleted: false,
        subscription: null,
        fileKeys: [],
      };
    }

    const subscription = await tx.subscription.findUnique({
      where: {
        company_id: userCompanyId,
      },
      select: {
        stripe_subscription_id: true,
        expires_at: true,
      },
    });

    //* The Stripe customer is needed after the commit to clean up every
    //* subscription and open checkout it holds, not only the stored one
    const company = await tx.company.findUnique({
      where: {
        id: userCompanyId,
      },
      select: {
        stripe_id: true,
      },
    });

    const companyFiles = await tx.file.findMany({
      where: {
        company_id: userCompanyId,
      },
      select: {
        s3_key: true,
      },
    });

    await tx.subscription.deleteMany({
      where: {
        company_id: userCompanyId,
      },
    });

    //* Invites cascade with the company too - deleted explicitly so the
    //* company delete never depends on the FK action
    await tx.teamInvites.deleteMany({
      where: {
        company_id: userCompanyId,
      },
    });

    await tx.company.delete({
      where: {
        id: userCompanyId,
      },
    });

    return {
      status: 'deleted',
      deletedUser,
      companyDeleted: true,
      companyId: userCompanyId,
      stripeCustomerId: company?.stripe_id ?? null,
      subscription,
      fileKeys: companyFiles.map((file) => file.s3_key),
    };
  });

  if (deletionResult.status === 'deleted') {
    logInfo(`User ${userId} succesfully deleted`);

    posthogUserDeleteAccount(userId); // Fire-and-forget
  }

  return deletionResult;
};

const companyMemberInclude = {
  UserRoles: {
    include: {
      Role: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
};

export const getCompanyMembersInDb = async (companyId) => {
  const getCompanyMembersQuery = await prisma.user.findMany({
    where: {
      company_id: companyId,
    },
    omit: {
      password: true,
    },
    include: companyMemberInclude,
    orderBy: {
      created_at: 'desc',
    },
  });

  return getCompanyMembersQuery;
};

export const getOneCompanyMemberInDb = async (userId, companyId) => {
  //* Scoped by company so one company can never manage another's members
  const getOneCompanyMemberQuery = await prisma.user.findFirst({
    where: {
      id: userId,
      company_id: companyId,
    },
    omit: {
      password: true,
    },
    include: companyMemberInclude,
  });

  return getOneCompanyMemberQuery;
};

//* v1 keeps a single company role per user - the nested write replaces the
//* existing row so a member is never role-less. Runs under the company row
//* lock so the last-owner check and the write are atomic.
//*
//* Options:
//* - callerId: refuse unless the caller - a member of the same company whose
//*   role rows are re-read under the lock - outranks every role the member
//*   currently holds AND may grant the new role
//*
//* Resolves to { status: 'not_found' | 'last_owner' | 'forbidden' } or
//* { status: 'updated', member }
export const updateCompanyMemberRoleInDb = async (userId, companyId, role, options = {}) => {
  const { callerId } = options;

  return prisma.$transaction(async (tx) => {
    await lockCompanyForUpdateInDb(tx, companyId);

    const targetRoleNames = await getMemberRoleNamesInTx(tx, userId, companyId);

    if (!targetRoleNames) {
      return { status: 'not_found' };
    }

    if (callerId) {
      const callerRoleNames = await getMemberRoleNamesInTx(tx, callerId, companyId);

      if (!callerRoleNames
        || !outranksAllRoles(callerRoleNames, targetRoleNames)
        || !canGrantRole(callerRoleNames, role.name)) {
        return { status: 'forbidden' };
      }
    }

    if (targetRoleNames.includes(COMPANY_OWNER_ROLE) && role.name !== COMPANY_OWNER_ROLE) {
      const ownerCount = await countCompanyOwnersInTx(tx, companyId);

      if (ownerCount <= 1) {
        return { status: 'last_owner' };
      }
    }

    const updatedMember = await tx.user.update({
      where: {
        id: userId,
      },
      data: {
        UserRoles: {
          deleteMany: {},
          create: {
            role_id: role.id,
          },
        },
      },
      omit: {
        password: true,
      },
      include: companyMemberInclude,
    });

    //* A demoted member can no longer vouch for invites to roles above their
    //* new rank - those pending invites die with the demotion
    await tx.teamInvites.deleteMany({
      where: {
        invited_by: userId,
        Role: {
          name: {
            notIn: rolesGrantableBy([role.name]),
          },
        },
      },
    });

    return {
      status: 'updated',
      member: updatedMember,
    };
  });
};
