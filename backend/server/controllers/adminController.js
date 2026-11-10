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
  countTotalSubscriptionsInDb,
} from '../models/subscriptionModel.js';
import {
  countActiveSessionsInDb,
  countActiveSessionsByUserInDb,
} from '../models/sessionModel.js';
import { deleteUserAndCleanup } from '../utils/userDeletionCleanup.js';
import { logInfo } from '../config/loggerFunctions.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

const parsePagination = (query) => ({
  limit: Math.min(Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  cursor: typeof query.cursor === 'string' && query.cursor.length > 0
    ? query.cursor
    : undefined,
});

export const getAllUsers = async (req, res) => {
  const filters = {};

  //* Whitelist the supported filters - any other query parameter is ignored
  //* instead of being passed through to the database
  if (req.query.role) {
    filters.role = req.query.role;
  }

  if (req.query.search) {
    filters.email = {
      contains: req.query.search,
      mode: 'insensitive',
    };
  }

  const { limit, cursor } = parsePagination(req.query);

  const users = await getAllUsersInDb(filters, { limit, cursor });

  const nextCursor = users.length === limit && users.length > 0
    ? users[users.length - 1].id
    : undefined;

  const totalUserCount = await countUsersInDb(filters);

  return res.status(200).json({
    userCount: totalUserCount,
    users: users,
    nextCursor: nextCursor,
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
    });
  } catch (error) {
    if (error.code === 'P2003') {
      return res.status(409).json({
        message: 'User deletion failed - Related DB entries exist',
      });
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

  //* Admin deletions are privileged actions - the actor is always recorded
  logInfo(`Superadmin ${req.user.id} deleted user ${deletionResult.deletedUser.id}`, {
    actorId: req.user.id,
    deletedUserId: deletionResult.deletedUser.id,
    companyDeleted: deletionResult.companyDeleted,
  });

  return res.status(200).json({
    userId: deletionResult.deletedUser.id,
  });
};

export const getAllCompanies = async (req, res) => {
  const filters = {};

  //* Whitelist the supported filter - any other query parameter is ignored
  //* instead of being passed through to the database
  if (req.query.search) {
    filters.name = {
      contains: req.query.search,
      mode: 'insensitive',
    };
  }

  const { limit, cursor } = parsePagination(req.query);

  const companies = await getAllCompaniesInDb(filters, { limit, cursor });

  const nextCursor = companies.length === limit && companies.length > 0
    ? companies[companies.length - 1].id
    : undefined;

  const totalCompanyCount = await countCompaniesInDb(filters);

  return res.status(200).json({
    companyCount: totalCompanyCount,
    companies: companies,
    nextCursor: nextCursor,
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
    activeSessionCount,
  ] = await Promise.all([
    countUsersInDb(),
    countUsersInDb({ role: 'superadmin' }),
    countUsersInDb({ created_at: { gte: new Date(Date.now() - WEEK_IN_MS) } }),
    countCompaniesInDb(),
    countTotalSubscriptionsInDb(),
    countActiveSubscriptionsInDb(),
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
      activeSessions: activeSessionCount,
    },
  });
};
