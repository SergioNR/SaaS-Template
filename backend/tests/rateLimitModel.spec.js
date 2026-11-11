import { jest } from '@jest/globals';

const queryRaw = jest.fn();
const executeRaw = jest.fn();
const rateLimitHitDeleteMany = jest.fn();

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {
    $queryRaw: queryRaw,
    $executeRaw: executeRaw,
    rateLimitHit: { deleteMany: rateLimitHitDeleteMany },
  },
}));

const {
  incrementRateLimitHitInDb,
  decrementRateLimitHitInDb,
  resetRateLimitHitInDb,
  deleteExpiredRateLimitHitsInDb,
} = await import('../server/models/rateLimitModel.js');

//* Tagged-template calls: [strings, ...values]
const sqlOf = (mock) => mock.mock.calls[0][0].join('?');
const valuesOf = (mock) => mock.mock.calls[0].slice(1);

describe('rateLimitModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('increments atomically with one upsert that restarts expired windows on the database clock', async () => {
    const resetAt = new Date('2030-01-01T00:15:00Z');
    queryRaw.mockResolvedValue([{ hits: 2, reset_at: resetAt }]);

    await expect(incrementRateLimitHitInDb('auth:1.2.3.4', 900000)).resolves.toEqual({ totalHits: 2, resetTime: resetAt });

    const sql = sqlOf(queryRaw);
    expect(sql).toContain('INSERT INTO "RateLimitHit"');
    expect(sql).toContain('ON CONFLICT ("key") DO UPDATE');
    expect(sql).toContain('<= now()');
    expect(sql).toContain('RETURNING "hits", "reset_at"');
    expect(valuesOf(queryRaw)).toEqual(['auth:1.2.3.4', 900000]);
  });

  it('decrements only a live window and never below zero', async () => {
    await decrementRateLimitHitInDb('auth:1.2.3.4');

    const sql = sqlOf(executeRaw);
    expect(sql).toContain('GREATEST("hits" - 1, 0)');
    expect(sql).toContain('"reset_at" > now()');
    expect(valuesOf(executeRaw)).toEqual(['auth:1.2.3.4']);
  });

  it('resets a key', async () => {
    await resetRateLimitHitInDb('auth:1.2.3.4');

    expect(rateLimitHitDeleteMany).toHaveBeenCalledWith({ where: { key: 'auth:1.2.3.4' } });
  });

  it('purges rows whose window ended more than a day ago and returns the count', async () => {
    executeRaw.mockResolvedValue(7);

    await expect(deleteExpiredRateLimitHitsInDb()).resolves.toBe(7);
    expect(sqlOf(executeRaw)).toContain('"reset_at" < now() - interval \'1 day\'');
  });

  it('propagates database errors', async () => {
    queryRaw.mockRejectedValue(new Error('db down'));

    await expect(incrementRateLimitHitInDb('k', 1000)).rejects.toThrow('db down');
  });
});
