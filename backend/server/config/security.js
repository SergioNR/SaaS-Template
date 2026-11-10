export const BCRYPT_SALT_ROUNDS = 12;

export const SESSION_COOKIE_NAME = 'app.sid';

//* One lifetime for both halves of a session: the cookie's maxAge (browser
//* side) and the store row's expiry (database side), so neither outlives
//* the other
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

//* Shared by the session middleware (which adds `maxAge`) and every
//* `res.clearCookie` call: browsers only drop a cookie when the clearing
//* Set-Cookie carries the same `secure` / `sameSite` attributes it was set
//* with, so the attributes live in exactly one place
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.DEPLOY_ENVIRONMENT !== 'localhost', // Cookie must travel over HTTPS outside local development
  // 'none' requires 'Secure' - browsers reject SameSite=None without it, so
  // local HTTP dev must use 'lax' (ports are irrelevant for same-site cookies)
  sameSite: process.env.DEPLOY_ENVIRONMENT !== 'localhost' ? 'none' : 'lax',
};

export const FREE_TRIAL_DURATION_MS = 604800000; // 7 day trial

export const INVITE_EXPIRY_DURATION_MS = 604800000; // 7 day team invite expiry
