import rateLimit from 'express-rate-limit';
import { logRateLimited } from '../config/loggerFunctions.js';
import { sharedCredentialLimiterOptions } from '../config/rateLimitStore.js';

//* Dedicated limiter for the verification-email resend so email bombing is
//* throttled on its own budget, independent of the shared credential bucket
//* (mirrors passwordResetLimiter)
export const verificationEmailLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5, // Limit each IP to 5 verification email requests per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  //* Shared across replicas when RATE_LIMIT_STORE=postgres; fails open
  ...sharedCredentialLimiterOptions('verifyemail:'),
  handler: (req, res /* , next, options */) => {
    logRateLimited(req);
    res.status(429).json({
      message: 'Too many verification email requests - please try again later',
    });
  },
});
