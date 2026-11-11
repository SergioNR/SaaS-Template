import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { logRateLimited } from '../config/loggerFunctions.js';
import { sharedCredentialLimiterOptions } from '../config/rateLimitStore.js';

//* Per-account brute-force guard for login, keyed by the normalized email
//* (`username`) together with the client IP. The account part throttles
//* guessing against one account from one source; the IP part keeps a single
//* attacker from locking a victim out of their own account by burning the
//* budget from elsewhere. Only failed attempts count (successful logins are
//* skipped). Must run after the login validator so the email is normalized.
//* `ipKeyGenerator` collapses an IPv6 address to its /56 subnet - a single
//* IPv6 client controls a whole block and could otherwise rotate addresses to
//* get a fresh budget on every attempt (IPv4 addresses pass through as-is)
export const loginAccountKey = (req) => `login:${ipKeyGenerator(req.ip ?? '')}:${String(req.body?.username ?? '').trim().toLowerCase()}`;

export const loginAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 failed login attempts per account + IP per window
  skipSuccessfulRequests: true,
  keyGenerator: loginAccountKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  //* Shared across replicas when RATE_LIMIT_STORE=postgres; fails open.
  //* The key already carries its own `login:` namespace
  ...sharedCredentialLimiterOptions('rl:'),
  handler: (req, res /* , next, options */) => {
    logRateLimited(req);
    res.status(429).json({
      message: 'Too many failed login attempts for this account - please try again later',
    });
  },
});
