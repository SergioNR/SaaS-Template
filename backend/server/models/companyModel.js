import { prisma } from '../config/prismaClient.js';
import { resolveListQueryArgs } from '../utils/cursorPagination.js';

//* No `id` - for paid rows it is the Stripe subscription id, which is never exposed
const subscriptionPublicFields = {
  created_at: true,
  updated_at: true,
  expires_at: true,
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

//* `sort` is an admin sort spec (utils/adminColumnSorts.js) or null for
//* the default newest-first order
export const getAllCompaniesInDb = async (filters = {}, pagination = {}, sort = null) => {
  const listArgs = await resolveListQueryArgs(filters, pagination, sort, (cursorId) => prisma.company.findUnique({
    where: {
      id: cursorId,
    },
    select: {
      id: true,
      [sort.field]: true,
    },
  }));

  if (!listArgs) {
    return [];
  }

  const getAllCompaniesQuery = await prisma.company.findMany({
    ...listArgs,
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
    subscription: Subscription[0] ?? null,
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
    subscription: Subscription[0] ?? null,
    users: User,
  };
};
