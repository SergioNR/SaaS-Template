import rateLimit from 'express-rate-limit';
import { logRateLimited } from '../config/loggerFunctions.js';
import { sharedCredentialLimiterOptions } from '../config/rateLimitStore.js';

//* Dedicated limiter for the password-reset email request so email bombing is
//* throttled on its own budget instead of sharing the login/register/invite
//* bucket (login failures no longer consume password-reset attempts)
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // Limit each IP to 5 password reset requests per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  //* Shared across replicas when RATE_LIMIT_STORE=postgres; fails open
  ...sharedCredentialLimiterOptions('pwreset:'),
  handler: (req, res /* , next, options */) => {
    logRateLimited(req);
    res.status(429).json({
      message: 'Too many password reset requests - please try again later',
    });
  },
});
