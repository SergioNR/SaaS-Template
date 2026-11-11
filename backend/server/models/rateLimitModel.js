import { prisma } from '../config/prismaClient.js';

//* Storage of the shared rate-limit store (config/rateLimitStore.js). Every
//* window computation uses the DATABASE clock (now()) so replicas with
//* skewed clocks agree on when a window resets.

//* One atomic upsert: a fresh key or an expired window starts over at 1 with
//* a new reset time, a live window is incremented. Resolves to
//* { totalHits, resetTime }
export const incrementRateLimitHitInDb = async (key, windowMs) => {
  const [row] = await prisma.$queryRaw`
    INSERT INTO "RateLimitHit" ("key", "hits", "reset_at")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowMs}::double precision / 1000))
    ON CONFLICT ("key") DO UPDATE SET
      "hits" = CASE WHEN "RateLimitHit"."reset_at" <= now() THEN 1 ELSE "RateLimitHit"."hits" + 1 END,
      "reset_at" = CASE WHEN "RateLimitHit"."reset_at" <= now() THEN EXCLUDED."reset_at" ELSE "RateLimitHit"."reset_at" END
    RETURNING "hits", "reset_at"
  `;

  return {
    totalHits: Number(row.hits),
    resetTime: new Date(row.reset_at),
  };
};

//* Used by skipSuccessfulRequests / skipFailedRequests - only a live window
//* is decremented, never below zero
export const decrementRateLimitHitInDb = async (key) => {
  await prisma.$executeRaw`
    UPDATE "RateLimitHit"
    SET "hits" = GREATEST("hits" - 1, 0)
    WHERE "key" = ${key} AND "reset_at" > now()
  `;
};

export const resetRateLimitHitInDb = async (key) => {
  await prisma.rateLimitHit.deleteMany({
    where: {
      key: key,
    },
  });
};

//* Purge job: rows whose window ended more than a day ago. An expired row is
//* harmless (the next increment restarts it) - this only bounds table size.
//* Errors propagate to runExclusiveCronTick
export const deleteExpiredRateLimitHitsInDb = async () => {
  const deleteResult = await prisma.$executeRaw`
    DELETE FROM "RateLimitHit" WHERE "reset_at" < now() - interval '1 day'
  `;

  return Number(deleteResult);
};
