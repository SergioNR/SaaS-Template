import { prisma } from '../config/prismaClient.js';
import { lockCompanyForUpdateInDb } from './companyModel.js';
import { toPublicSubscription } from '../config/stripeSubscriptionStatuses.js';

const subscriptionStateFields = {
  stripe_subscription_id: true,
  stripe_status: true,
  stripe_synced_at: true,
  expires_at: true,
};

//* Nothing slow runs inside the lock any more (the Stripe read happens
//* before it), but waiting for a concurrent holder of the company lock still
//* counts against the interactive transaction, so it keeps some headroom
//* over Prisma's 5s default
const SUBSCRIPTION_SYNC_TIMEOUT_MS = 10000;

//* A write is stale when it is based on a Stripe read of the SAME
//* subscription taken before the read that produced the stored state
const isStaleSubscriptionWrite = (storedSubscription, subscriptionWrite) => Boolean(
  storedSubscription?.stripe_synced_at
  && storedSubscription.stripe_subscription_id === subscriptionWrite.stripeSubscriptionId
  && new Date(storedSubscription.stripe_synced_at) > subscriptionWrite.syncedAt,
);

//* Serializes every subscription write of a company behind its row lock.
//* Stripe delivers events concurrently and out of order, so the caller reads
//* the Stripe subscription BEFORE locking (a slow Stripe call must never hold
//* the company lock) and `resolveSubscriptionWrite` decides under the lock,
//* against the stored row, what to write (or null to skip). The write carries
//* `syncedAt` - when its Stripe read started - and is dropped when the
//* stored state of the same subscription came from a later read, so the
//* freshest read always wins regardless of commit order.
//* Resolves to true when a write happened
export const syncSubscriptionWithCompanyLockInDb = async (companyId, resolveSubscriptionWrite) => {
  const written = await prisma.$transaction(async (tx) => {
    await lockCompanyForUpdateInDb(tx, companyId);

    const storedSubscription = await tx.subscription.findUnique({
      where: {
        company_id: companyId,
      },
      select: subscriptionStateFields,
    });

    const subscriptionWrite = resolveSubscriptionWrite(storedSubscription);

    if (!subscriptionWrite || isStaleSubscriptionWrite(storedSubscription, subscriptionWrite)) {
      return false;
    }

    const subscriptionData = {
      stripe_subscription_id: subscriptionWrite.stripeSubscriptionId,
      stripe_status: subscriptionWrite.status,
      stripe_synced_at: subscriptionWrite.syncedAt,
      expires_at: subscriptionWrite.expiresAt,
    };

    //* Upsert so Stripe event retries and the first checkout of a company
    //* without a Subscription row are both handled idempotently. The row is
    //* never deleted when the Stripe subscription ends - expires_at moves to
    //* the end date instead, so the company keeps its row and can resubscribe
    await tx.subscription.upsert({
      where: {
        company_id: companyId,
      },
      update: subscriptionData,
      create: {
        ...subscriptionData,
        company_id: companyId,
      },
    });

    return true;
  }, {
    timeout: SUBSCRIPTION_SYNC_TIMEOUT_MS,
  });

  return written;
};

export const getCompanyStripeIdInDb = async (companyId) => {
  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      stripe_id: true,
    },
  });

  return company?.stripe_id ?? null;
};

//* Conditional write (only while stripe_id is still null) so two concurrent
//* first checkouts cannot overwrite each other's customer id. Returns the
//* customer id that ends up stored - on a lost race that is the winner's id
export const storeBillingCompanyIdInDb = async (companyId, stripeCustomerId) => {
  const updateResult = await prisma.company.updateMany({
    where: {
      id: companyId,
      stripe_id: null,
    },
    data: {
      stripe_id: stripeCustomerId,
    },
  });

  if (updateResult.count === 1) {
    return stripeCustomerId;
  }

  return getCompanyStripeIdInDb(companyId);
};

export const getCompanyIdByStripeCustomerIdInDb = async (stripeCustomerId) => {
  const company = await prisma.company.findUnique({
    where: {
      stripe_id: stripeCustomerId,
    },
    select: {
      id: true,
    },
  });

  return company?.id ?? null;
};

export const getSubscriptionDataInDb = async (companyId) => {
  const whereClause = {
    company_id: companyId,
  };

  const subscriptionData = await prisma.subscription.findUnique({
    where: whereClause,
    select: {
      ...subscriptionStateFields,
      Company: {
        select: {
          stripe_id: true,
        },
      },
    },
  });

  return subscriptionData;
};

//* Public shape returned to clients - deliberately excludes the row id, the
//* Stripe subscription and customer ids and any other Company fields. Both
//* Stripe ids are exposed as booleans so the client can gate portal access
//* and tell trials from paid plans without ever seeing an id
export const getSubscriptionPublicDataInDb = async (companyId) => {
  const subscriptionData = await prisma.subscription.findUnique({
    where: {
      company_id: companyId,
    },
    select: {
      stripe_subscription_id: true,
      expires_at: true,
      created_at: true,
      updated_at: true,
      Company: {
        select: {
          stripe_id: true,
        },
      },
    },
  });

  if (!subscriptionData) {
    return null;
  }

  const { Company, ...subscriptionRow } = subscriptionData;

  return {
    ...toPublicSubscription(subscriptionRow),
    has_billing_id: Boolean(Company?.stripe_id),
  };
};

export const countTotalSubscriptionsInDb = async () => {
  const totalSubscriptionCount = await prisma.subscription.count();

  return totalSubscriptionCount;
};

//* Active PAID subscriptions - the isStoredSubscriptionActive definition
//* (Stripe-backed and unexpired) as a count; trials are counted apart
export const countActiveSubscriptionsInDb = async () => {
  const activeSubscriptionCount = await prisma.subscription.count({
    where: {
      stripe_subscription_id: {
        not: null,
      },
      expires_at: {
        gt: new Date(),
      },
    },
  });

  return activeSubscriptionCount;
};

//* Running trials: not Stripe-backed and unexpired
export const countActiveTrialsInDb = async () => {
  const activeTrialCount = await prisma.subscription.count({
    where: {
      stripe_subscription_id: null,
      expires_at: {
        gt: new Date(),
      },
    },
  });

  return activeTrialCount;
};
