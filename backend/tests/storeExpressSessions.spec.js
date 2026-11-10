import { jest } from '@jest/globals';

//* The module builds its middleware at import time from the environment -
//* pin a deployed configuration before importing it
process.env.DEPLOY_ENVIRONMENT = 'production';
process.env.SESSION_SECRET = 'test-session-secret';

const sessionMock = jest.fn(() => 'session-middleware');
const storeOptions = [];

jest.unstable_mockModule('express-session', () => ({
  default: sessionMock,
}));

jest.unstable_mockModule('@quixo3/prisma-session-store', () => ({
  PrismaSessionStore: class {
    constructor(client, options) {
      this.client = client;
      storeOptions.push(options);
    }
  },
}));

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: { session: {} },
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logWarn: jest.fn(),
}));

const { storeSessions } = await import('../server/middlewares/storeExpressSessions.js');
const { SESSION_COOKIE_NAME, SESSION_TTL_MS } = await import('../server/config/security.js');
const { prisma } = await import('../server/config/prismaClient.js');

describe('storeSessions', () => {
  const [sessionOptions] = sessionMock.mock.calls[0];

  it('exports the configured express-session middleware', () => {
    expect(storeSessions).toBe('session-middleware');
  });

  it('signs sessions with SESSION_SECRET and the shared cookie name', () => {
    expect(sessionOptions.name).toBe(SESSION_COOKIE_NAME);
    expect(sessionOptions.secret).toBe('test-session-secret');
  });

  it('never saves empty sessions nor rewrites unchanged ones', () => {
    expect(sessionOptions.saveUninitialized).toBe(false);
    expect(sessionOptions.resave).toBe(false);
  });

  it('sends a secure, httpOnly, SameSite=None cookie outside localhost', () => {
    expect(sessionOptions.cookie).toEqual({
      maxAge: SESSION_TTL_MS,
      httpOnly: true,
      secure: true,
      sameSite: 'none',
    });
  });

  it('expires the store row with the same lifetime as the cookie', () => {
    expect(storeOptions).toHaveLength(1);
    expect(storeOptions[0].ttl).toBe(SESSION_TTL_MS);
    expect(storeOptions[0].dbRecordIdIsSessionId).toBe(true);
    expect(sessionOptions.store.client).toBe(prisma);
  });
});
