import { prisma } from '../config/prismaClient.js';
import { listPaginationArgs } from '../utils/cursorPagination.js';
import { toPublicSubscription } from '../config/stripeSubscriptionStatuses.js';

//* Selected internally only: `stripe_subscription_id` decides `status` /
//* `is_paid` and is dropped by toPublicSubscription; the internal row id is
//* never selected
const subscriptionPublicFields = {
  created_at: true,
  updated_at: true,
  expires_at: true,
  stripe_subscription_id: true,
};

export const getCompanyByIdInDb = async (companyId) => {
  const getCompanyByIdQuery = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  return getCompanyByIdQuery;
};

//* Row lock on the company, taken inside an interactive transaction (`tx`).
//* Every membership-changing write of a company (role changes, member and
//* self deletion) takes it first, so last-owner / last-member checks and the
//* write they guard can never interleave with a concurrent one
export const lockCompanyForUpdateInDb = async (tx, companyId) => {
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${companyId} FOR UPDATE`;
};

export const getAllCompaniesInDb = async (filters = {}, pagination = {}) => {
  const getAllCompaniesQuery = await prisma.company.findMany({
    where: filters,
    include: {
      _count: {
        select: {
          User: true,
        },
      },
      Subscription: {
        select: subscriptionPublicFields,
      },
    },
    //* Newest first with the id tiebreaker - the order the cursor walk relies on
    ...listPaginationArgs(pagination),
  });

  //* The Stripe customer id is destructured away so it never reaches the
  //* response - clients only get the derived `stripeLinked` boolean.
  //* `Subscription` is an include-list (unique FK) normalized to an object
  return getAllCompaniesQuery.map(({
    stripe_id: stripeCustomerId,
    _count,
    Subscription,
    ...company
  }) => ({
    ...company,
    stripeLinked: Boolean(stripeCustomerId),
    userCount: _count.User,
    subscription: toPublicSubscription(Subscription[0] ?? null),
  }));
};

export const countCompaniesInDb = async (filters = {}) => {
  const companyCount = await prisma.company.count({
    where: filters,
  });

  return companyCount;
};

export const getCompanyDetailInDb = async (companyId) => {
  const companyDetailQuery = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      Subscription: {
        select: subscriptionPublicFields,
      },
      User: {
        select: {
          id: true,
          email: true,
          role: true,
          created_at: true,
          last_login_at: true,
        },
        orderBy: {
          created_at: 'desc',
        },
      },
    },
  });

  if (!companyDetailQuery) {
    return null;
  }

  const {
    stripe_id: stripeCustomerId,
    User,
    Subscription,
    ...company
  } = companyDetailQuery;

  return {
    ...company,
    stripeLinked: Boolean(stripeCustomerId),
    subscription: toPublicSubscription(Subscription[0] ?? null),
    users: User,
  };
};
