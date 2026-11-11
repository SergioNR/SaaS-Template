import rateLimit from 'express-rate-limit';
import { logRateLimited } from '../config/loggerFunctions.js';
import { sharedCredentialLimiterOptions } from '../config/rateLimitStore.js';

//* Stricter limiter for credential-sensitive endpoints (login, register,
//* password reset) where brute-force and email-bombing are the main risks
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // Limit each IP to 10 authentication attempts per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  //* Shared across replicas when RATE_LIMIT_STORE=postgres; fails open
  ...sharedCredentialLimiterOptions('auth:'),
  handler: (req, res /* , next, options */) => {
    logRateLimited(req);
    res.status(429).json({
      message: 'Too many authentication attempts - please try again later',
    });
  },
});
