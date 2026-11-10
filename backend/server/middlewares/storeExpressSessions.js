import session from 'express-session';
import { PrismaSessionStore } from '@quixo3/prisma-session-store';
import { prisma } from '../config/prismaClient.js';
import { SESSION_COOKIE_NAME, SESSION_COOKIE_OPTIONS, SESSION_TTL_MS } from '../config/security.js';
import { requireEnv } from '../config/requiredEnv.js';

//* express-session rejects every request without a secret, so localhost falls
//* back to a fixed one - never reachable in deployed environments, which throw
const sessionSecret = requireEnv('SESSION_SECRET', 'refusing to start with unsigned sessions')
  ? process.env.SESSION_SECRET
  : 'localhost-only-insecure-session-secret';

const prismaSessionStore = new PrismaSessionStore(prisma, {
  checkPeriod: 2 * 60 * 1000, // ms
  dbRecordIdIsSessionId: true,
  dbRecordIdFunction: undefined,
  //* Explicit instead of derived from the cookie, so the row expiry cannot
  //* drift from SESSION_TTL_MS if the cookie options ever change
  ttl: SESSION_TTL_MS,
});

export const storeSessions = session({
  name: SESSION_COOKIE_NAME,
  secret: sessionSecret,
  resave: false, // https://www.npmjs.com/package/express-session#resave - Set to false because `touch` is implemented
  saveUninitialized: false, // https://www.npmjs.com/package/express-session#saveuninitialized - Set to false because we'll only save sessions with req.session data (eg: logins, storing relevant info that we want to keep)
  cookie: {
    maxAge: SESSION_TTL_MS,
    ...SESSION_COOKIE_OPTIONS, //* secure / sameSite / httpOnly shared with clearCookie
  },
  store: prismaSessionStore,
});
