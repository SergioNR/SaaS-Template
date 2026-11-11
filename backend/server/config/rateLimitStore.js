import { logWarn } from './loggerFunctions.js';
import { isLocalhost } from './requiredEnv.js';

//* Loaded lazily: the default memory store must not pull the Prisma client
//* into every module that imports a limiter
const loadRateLimitModel = () => import('../models/rateLimitModel.js');

//* RATE_LIMIT_STORE picks where the credential-path limiters (auth budget,
//* per-account login, password-reset email, password change) keep their
//* counters: `memory` (default, per process) or `postgres` (shared across
//* replicas and restarts). The global limiter, slow-down and webhook limiter
//* always stay in memory - they see every request
export const RATE_LIMIT_STORES = ['memory', 'postgres'];

export const resolveRateLimitStoreKind = () => {
  const value = (process.env.RATE_LIMIT_STORE ?? '').trim().toLowerCase();

  if (value === '') {
    return 'memory';
  }

  if (RATE_LIMIT_STORES.includes(value)) {
    return value;
  }

  const message = `RATE_LIMIT_STORE must be one of ${RATE_LIMIT_STORES.join(', ')} (got "${process.env.RATE_LIMIT_STORE}")`;

  //* A typo must not silently leave a multi-replica deployment on
  //* per-process budgets
  if (!isLocalhost()) {
    throw new Error(message);
  }

  logWarn(`${message} - using memory (ignored on localhost)`);

  return 'memory';
};

//* express-rate-limit Store backed by the RateLimitHit table. Errors are
//* thrown on purpose: with passOnStoreError the limiter lets the request
//* through and reports it to rateLimitLogger (a warning) - failing closed
//* would turn a database hiccup into a login outage
export class PrismaRateLimitStore {
  constructor(prefix) {
    this.prefix = prefix;
    //* Counters are shared - the library must not assume a per-instance store
    this.localKeys = false;
    this.windowMs = 60 * 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key) {
    const { incrementRateLimitHitInDb } = await loadRateLimitModel();

    return incrementRateLimitHitInDb(`${this.prefix}${key}`, this.windowMs);
  }

  async decrement(key) {
    const { decrementRateLimitHitInDb } = await loadRateLimitModel();

    await decrementRateLimitHitInDb(`${this.prefix}${key}`);
  }

  async resetKey(key) {
    const { resetRateLimitHitInDb } = await loadRateLimitModel();

    await resetRateLimitHitInDb(`${this.prefix}${key}`);
  }
}

//* One store per limiter - the prefix keeps their counters apart in the
//* shared table. Undefined means the library's default MemoryStore
export const createRateLimitStore = (prefix) => (
  resolveRateLimitStoreKind() === 'postgres' ? new PrismaRateLimitStore(prefix) : undefined
);

//* Limiter `logger`: store failures (passOnStoreError) and misconfiguration
//* warnings go through pino as warnings, never console and never an alert
export const rateLimitLogger = {
  error: (error, message) => logWarn(message ?? 'express-rate-limit error', error),
  warn: (error, message) => logWarn(message ?? 'express-rate-limit warning', error),
};

//* Options every credential-path limiter spreads in
export const sharedCredentialLimiterOptions = (prefix) => ({
  store: createRateLimitStore(prefix),
  passOnStoreError: true,
  logger: rateLimitLogger,
});
