import {
  getAllUsersInDb,
  countUsersInDb,
  getUserById,
  getUserDetailInDb,
} from '../models/userModel.js';
import {
  getAllCompaniesInDb,
  countCompaniesInDb,
  getCompanyDetailInDb,
} from '../models/companyModel.js';
import {
  countActiveSubscriptionsInDb,
  countActiveTrialsInDb,
  countTotalSubscriptionsInDb,
} from '../models/subscriptionModel.js';
import {
  countActiveSessionsInDb,
  countActiveSessionsByUserInDb,
} from '../models/sessionModel.js';
import { deleteUserAndCleanup } from '../utils/userDeletionCleanup.js';
import { logAudit } from '../config/loggerFunctions.js';
import { computeNextCursor, parsePagination } from '../utils/cursorPagination.js';
import { sendMappedWriteError } from '../utils/prismaErrors.js';
import { buildAdminListWhere } from '../utils/adminColumnFilters.js';
import { buildAdminListSort } from '../utils/adminColumnSorts.js';

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const USER_DELETION_WRITE_ERRORS = {
  P2003: { status: 409, message: 'User deletion failed - Related DB entries exist' },
};

export const getAllUsers = async (req, res) => {
  //* Whitelist the supported filters - the registry only reads its own
  //* (validated) parameters, any other query parameter is ignored instead of
  //* being passed through to the database. Applied to the page AND the count
  const filters = buildAdminListWhere('users', req.query);

  if (req.query.search) {
    filters.email = {
      contains: req.query.search,
      mode: 'insensitive',
    };
  }

  const { limit, cursor } = parsePagination(req.query);
  const sort = buildAdminListSort('users', req.query.sort, req.query.order);

  //* Page and total are independent reads - issued together
  const [users, totalUserCount] = await Promise.all([
    getAllUsersInDb(filters, { limit, cursor }, sort),
    countUsersInDb(filters),
  ]);

  return res.status(200).json({
    userCount: totalUserCount,
    users: users,
    nextCursor: computeNextCursor(users, limit),
  });
};

export const getOneUserById = async (req, res) => {
  const { userId } = req.params;

  const userDetail = await getUserDetailInDb(userId);

  if (userDetail === null) {
    return res.status(404).json({});
  }

  const activeSessionCount = await countActiveSessionsByUserInDb(userId);

  return res.status(200).json({
    user: {
      ...userDetail,
      activeSessionCount,
    },
  });
};

export const deleteOneUserById = async (req, res) => {
  const { userId } = req.params;

  if (userId === req.user.id) {
    return res.status(409).json({
      message: 'Superadmins cannot delete their own account from the admin endpoint - use the user endpoint instead',
    });
  }

  const existingUser = await getUserById(userId);

  if (!existingUser) {
    return res.status(404).json({});
  }

  let deletionResult;

  //* The P2003 mapping wraps only the deletion transaction - the post-commit
  //* Stripe/S3 cleanup never throws, so a committed delete is never misreported.
  //* Superadmins are bound by the last-owner rule like everyone else: a
  //* company must never be left with members and nobody able to manage them
  try {
    deletionResult = await deleteUserAndCleanup(userId, {
      protectLastOwner: true,
      actorKind: 'admin',
    });
  } catch (error) {
    if (sendMappedWriteError(res, error, USER_DELETION_WRITE_ERRORS)) {
      return res;
    }

    throw error; //* Forwarded to the global error handler (Express 5)
  }

  if (deletionResult.status === 'not_found') {
    return res.status(404).json({});
  }

  if (deletionResult.status === 'last_owner') {
    //* Stable code - the 409 status is shared with self-delete and FK conflicts
    return res.status(409).json({
      message: 'The user is the last owner of a company with other members - promote another member first',
      code: 'LAST_COMPANY_OWNER',
    });
  }

  if (deletionResult.status === 'last_superadmin') {
    return res.status(409).json({
      message: 'The platform must keep at least one superadmin',
      code: 'LAST_SUPERADMIN',
    });
  }

  //* Admin deletions are privileged actions - the audit line always carries
  //* the acting superadmin (userId) next to the deleted user
  logAudit(req, 'admin.user.deleted', { entity: 'user', entityId: deletionResult.deletedUser.id });

  if (deletionResult.companyDeleted) {
    logAudit(req, 'admin.company.deleted', { entity: 'company', entityId: deletionResult.companyId });
  }

  return res.status(200).json({
    userId: deletionResult.deletedUser.id,
  });
};

export const getAllCompanies = async (req, res) => {
  //* Whitelist the supported filters - the registry only reads its own
  //* (validated) parameters, any other query parameter is ignored instead of
  //* being passed through to the database. Applied to the page AND the count
  const filters = buildAdminListWhere('companies', req.query);

  if (req.query.search) {
    filters.name = {
      contains: req.query.search,
      mode: 'insensitive',
    };
  }

  const { limit, cursor } = parsePagination(req.query);
  const sort = buildAdminListSort('companies', req.query.sort, req.query.order);

  //* Page and total are independent reads - issued together
  const [companies, totalCompanyCount] = await Promise.all([
    getAllCompaniesInDb(filters, { limit, cursor }, sort),
    countCompaniesInDb(filters),
  ]);

  return res.status(200).json({
    companyCount: totalCompanyCount,
    companies: companies,
    nextCursor: computeNextCursor(companies, limit),
  });
};

export const getOneCompanyById = async (req, res) => {
  const { companyId } = req.params;

  const companyDetail = await getCompanyDetailInDb(companyId);

  if (companyDetail === null) {
    return res.status(404).json({});
  }

  return res.status(200).json({
    company: companyDetail,
  });
};

export const getAdminStats = async (req, res) => {
  const [
    totalUserCount,
    totalSuperadminCount,
    newUsersLastWeekCount,
    totalCompanyCount,
    totalSubscriptionCount,
    activeSubscriptionCount,
    activeTrialCount,
    activeSessionCount,
  ] = await Promise.all([
    countUsersInDb(),
    countUsersInDb({ role: 'superadmin' }),
    countUsersInDb({ created_at: { gte: new Date(Date.now() - WEEK_IN_MS) } }),
    countCompaniesInDb(),
    countTotalSubscriptionsInDb(),
    countActiveSubscriptionsInDb(),
    countActiveTrialsInDb(),
    countActiveSessionsInDb(),
  ]);

  return res.status(200).json({
    stats: {
      totalUsers: totalUserCount,
      totalSuperadmins: totalSuperadminCount,
      newUsersLastWeek: newUsersLastWeekCount,
      totalCompanies: totalCompanyCount,
      totalSubscriptions: totalSubscriptionCount,
      activeSubscriptions: activeSubscriptionCount,
      activeTrials: activeTrialCount,
      activeSessions: activeSessionCount,
    },
  });
};
