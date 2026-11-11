import { jest } from '@jest/globals';
import rateLimit from 'express-rate-limit';

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logWarn: jest.fn(),
  logError: jest.fn(),
  logInfo: jest.fn(),
  logRateLimited: jest.fn(),
}));

jest.unstable_mockModule('../server/models/rateLimitModel.js', () => ({
  incrementRateLimitHitInDb: jest.fn(),
  decrementRateLimitHitInDb: jest.fn(),
  resetRateLimitHitInDb: jest.fn(),
  deleteExpiredRateLimitHitsInDb: jest.fn(),
}));

const {
  PrismaRateLimitStore,
  createRateLimitStore,
  rateLimitLogger,
  resolveRateLimitStoreKind,
  sharedCredentialLimiterOptions,
} = await import('../server/config/rateLimitStore.js');
const {
  incrementRateLimitHitInDb,
  decrementRateLimitHitInDb,
  resetRateLimitHitInDb,
} = await import('../server/models/rateLimitModel.js');
const { logWarn, logError } = await import('../server/config/loggerFunctions.js');
const {
  isCountedPasswordChangeFailure,
  passwordChangeKey,
} = await import('../server/middlewares/passwordChangeRateLimiter.js');

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  jest.clearAllMocks();
});

describe('resolveRateLimitStoreKind', () => {
  it.each([
    [undefined, 'memory'],
    ['', 'memory'],
    ['memory', 'memory'],
    ['postgres', 'postgres'],
    [' Postgres ', 'postgres'],
  ])('RATE_LIMIT_STORE=%p resolves to %s', (value, expected) => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    if (value === undefined) delete process.env.RATE_LIMIT_STORE;
    else process.env.RATE_LIMIT_STORE = value;

    expect(resolveRateLimitStoreKind()).toBe(expected);
  });

  it('refuses an unknown value outside localhost', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    process.env.RATE_LIMIT_STORE = 'redis';

    expect(() => resolveRateLimitStoreKind()).toThrow(/RATE_LIMIT_STORE/);
  });

  it('only warns about an unknown value on localhost and falls back to memory', () => {
    process.env.DEPLOY_ENVIRONMENT = 'localhost';
    process.env.RATE_LIMIT_STORE = 'redis';

    expect(resolveRateLimitStoreKind()).toBe('memory');
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('RATE_LIMIT_STORE'));
  });
});

describe('createRateLimitStore', () => {
  it('uses the library memory store by default', () => {
    delete process.env.RATE_LIMIT_STORE;

    expect(createRateLimitStore('auth:')).toBeUndefined();
  });

  it('returns a shared Postgres store per prefix when enabled', () => {
    process.env.RATE_LIMIT_STORE = 'postgres';

    const store = createRateLimitStore('auth:');

    expect(store).toBeInstanceOf(PrismaRateLimitStore);
    expect(store.prefix).toBe('auth:');
    expect(store.localKeys).toBe(false);
  });

  it('credential limiters fail open and log through pino', () => {
    delete process.env.RATE_LIMIT_STORE;

    expect(sharedCredentialLimiterOptions('auth:')).toEqual({
      store: undefined,
      passOnStoreError: true,
      logger: rateLimitLogger,
    });
  });
});

describe('PrismaRateLimitStore', () => {
  it('prefixes keys and uses the limiter window', async () => {
    const store = new PrismaRateLimitStore('auth:');
    store.init({ windowMs: 900000 });
    const resetTime = new Date('2030-01-01T00:15:00Z');
    incrementRateLimitHitInDb.mockResolvedValue({ totalHits: 3, resetTime });

    await expect(store.increment('1.2.3.4')).resolves.toEqual({ totalHits: 3, resetTime });
    await store.decrement('1.2.3.4');
    await store.resetKey('1.2.3.4');

    expect(incrementRateLimitHitInDb).toHaveBeenCalledWith('auth:1.2.3.4', 900000);
    expect(decrementRateLimitHitInDb).toHaveBeenCalledWith('auth:1.2.3.4');
    expect(resetRateLimitHitInDb).toHaveBeenCalledWith('auth:1.2.3.4');
  });

  it('lets the request through and only warns when the store fails', async () => {
    process.env.RATE_LIMIT_STORE = 'postgres';
    incrementRateLimitHitInDb.mockRejectedValue(new Error('database unreachable'));

    const limiter = rateLimit({
      windowMs: 60000,
      limit: 1,
      validate: false,
      ...sharedCredentialLimiterOptions('auth:'),
    });

    const next = jest.fn();
    const res = {
      setHeader: jest.fn(), status: jest.fn().mockReturnThis(), send: jest.fn(), on: jest.fn(),
    };

    await limiter({ ip: '1.2.3.4', headers: {}, app: { get: () => false } }, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('allowing request'), expect.any(Error));
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('passwordChangeRateLimiter helpers', () => {
  it('keys the budget by account', () => {
    expect(passwordChangeKey({ user: { id: 'user-1' }, ip: '1.2.3.4' })).toBe('pwchange:user-1');
  });

  it.each([
    [400, 'AUTH_CURRENT_PASSWORD_INCORRECT', true],
    [400, 'AUTH_PASSWORD_UNCHANGED', false],
    [200, undefined, false],
    [404, undefined, false],
  ])('status %s with code %s counts: %s', (statusCode, responseCode, counted) => {
    expect(isCountedPasswordChangeFailure({ statusCode, locals: { responseCode } })).toBe(counted);
  });
});
