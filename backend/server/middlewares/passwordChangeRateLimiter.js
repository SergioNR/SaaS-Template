import rateLimit from 'express-rate-limit';
import { logRateLimited } from '../config/loggerFunctions.js';
import { sharedCredentialLimiterOptions } from '../config/rateLimitStore.js';

export const PASSWORD_CHANGE_FAILURE_CODE = 'AUTH_CURRENT_PASSWORD_INCORRECT';

//* Keyed by the account, not the IP: the threat is a stolen session cookie
//* brute-forcing the current password (needed to lock the owner out), and
//* the attacker controls the IP. Mounted behind checkAuthentication(), so
//* req.user is always set
export const passwordChangeKey = (req) => `pwchange:${req.user?.id ?? 'anonymous'}`;

//* Only wrong current passwords count - every other outcome (success,
//* AUTH_PASSWORD_UNCHANGED, ...) is treated as "successful" and refunded by
//* skipSuccessfulRequests. 422s never reach the limiter (it runs after
//* sanitizerResult)
export const isCountedPasswordChangeFailure = (res) => res.statusCode === 400
  && res.locals?.responseCode === PASSWORD_CHANGE_FAILURE_CODE;

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 failed current-password checks per account per window
  skipSuccessfulRequests: true,
  requestWasSuccessful: (req, res) => !isCountedPasswordChangeFailure(res),
  keyGenerator: passwordChangeKey,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  //* Shared across replicas when RATE_LIMIT_STORE=postgres; fails open
  ...sharedCredentialLimiterOptions('pwchange:'),
  handler: (req, res /* , next, options */) => {
    logRateLimited(req);
    res.status(429).json({
      message: 'Too many failed password change attempts - please try again later',
    });
  },
});

//* The limiter only sees the status at response finish - the stable `code`
//* of the JSON body is mirrored into res.locals so a wrong current password
//* can be told apart from the other 400s
export const passwordChangeLimiter = (req, res, next) => {
  const json = res.json.bind(res);

  res.json = (body) => {
    res.locals.responseCode = body?.code;

    return json(body);
  };

  return limiter(req, res, next);
};
