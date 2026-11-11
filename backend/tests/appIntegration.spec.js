import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import session from 'express-session';
import pino from 'pino';
import request from 'supertest';

//* HTTP-level specs: the real Express app from createApp() - real middleware
//* order, routers, validators, limiters, passport and express-session - with
//* only the I/O edges mocked (Prisma, Stripe, Brevo, the Postgres session
//* store, log output). No port is opened; supertest drives the app directly.

//* A production-like deployment: secure cookies, limiters on, docs off.
//* Set before the dynamic imports below - several modules read the
//* environment at import time
Object.assign(process.env, {
  NODE_ENV: 'test',
  DEPLOY_ENVIRONMENT: 'production',
  TRUST_PROXY: '1',
  FRONT_WEB_APP_ORIGIN_URL: 'https://app.example.com',
  SESSION_SECRET: 'integration-test-session-secret',
  STRIPE_WEBHOOK_SECRET: 'whsec_integration_test',
});
['S3_BUCKET', 'TELEGRAM_BOT_API_KEY', 'POSTHOG_API_KEY', 'BETTER_STACK_SOURCE_TOKEN', 'LOG_LEVEL'].forEach((name) => {
  delete process.env[name];
});

const FRONT_ORIGIN = 'https://app.example.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const prismaMock = {
  $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
  $disconnect: jest.fn().mockResolvedValue(undefined),
  user: {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({}),
  },
  session: {
    update: jest.fn().mockResolvedValue({}),
  },
  userRole: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

const stripeCalls = {
  checkoutSessionsCreate: jest.fn(),
  checkoutSessionsList: jest.fn(),
  subscriptionsList: jest.fn(),
};

const constructEvent = jest.fn(() => {
  throw new Error('No signatures found matching the expected signature for payload');
});

jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: prismaMock,
}));

jest.unstable_mockModule('../server/config/stripe.js', () => ({
  stripeInstance: {
    webhooks: { constructEvent },
    checkout: { sessions: { create: stripeCalls.checkoutSessionsCreate, list: stripeCalls.checkoutSessionsList } },
    subscriptions: { list: stripeCalls.subscriptionsList },
  },
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/brevo.js', () => ({
  brevoClient: { transactionalEmails: { sendTransacEmail: jest.fn().mockResolvedValue({}) } },
  companyEmails: { support: 'support@acme.test', billing: 'support@acme.test', hello: 'support@acme.test' },
  templateIds: { resetPassword: 2, teamInvite: 3 },
  commonTemplateParams: () => ({ appOrigin: FRONT_ORIGIN }),
}));

//* The real express-session runs on an in-memory store instead of Postgres
jest.unstable_mockModule('@quixo3/prisma-session-store', () => ({
  PrismaSessionStore: class extends session.MemoryStore {},
}));

//* Captured logger - nothing is printed, every JSON line is kept so specs can
//* assert on access/error lines
const logLines = [];
jest.unstable_mockModule('../server/config/logger.js', () => ({
  logger: pino({ level: 'info' }, { write: (line) => logLines.push(JSON.parse(line)) }),
}));

//* pino-http writes the access line on response finish - give it a tick
const findAccessLine = async (requestId) => {
  await new Promise((resolve) => { setImmediate(resolve); });

  return logLines.find((line) => line.reqId === requestId && line.res !== undefined);
};

const { createApp } = await import('../server/createApp.js');
const { markShuttingDown, resetProcessLifecycle } = await import('../server/utils/processLifecycle.js');

const app = createApp();

//* authLimiter (10 / 15 min per IP) is a module singleton shared by every
//* request of this file - count the requests that reach it
let authLimiterHits = 0;

afterAll(() => {
  resetProcessLifecycle();
});

describe('request ids', () => {
  it('answers every request with a fresh server-generated X-Request-Id', async () => {
    const first = await request(app).get('/');
    const second = await request(app).get('/');

    expect(first.status).toBe(200);
    expect(first.body).toEqual({ message: 'server is healthy' });
    expect(first.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(second.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(second.headers['x-request-id']).not.toBe(first.headers['x-request-id']);
  });

  it('never honours an inbound X-Request-Id', async () => {
    const response = await request(app).get('/').set('X-Request-Id', 'spoofed-correlation-id');

    expect(response.headers['x-request-id']).not.toBe('spoofed-correlation-id');
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
  });
});

describe('middleware order', () => {
  it('runs helmet and the request logger before the health probe', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('allows only the configured front-end origin through CORS', async () => {
    const allowed = await request(app).get('/').set('Origin', FRONT_ORIGIN);
    const foreign = await request(app).get('/').set('Origin', 'https://evil.example.com');

    expect(allowed.headers['access-control-allow-origin']).toBe(FRONT_ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects a state-changing API request without an allowed Origin before parsing its body', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'text/plain')
      .send('username=a&password=b');

    //* 403 from the origin check - not 415 from the content-type check that
    //* runs after it
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ message: 'Request origin is not allowed' });
  });

  it('rejects a foreign Origin with 403', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://evil.example.com')
      .send({ username: 'owner@acme.test', password: 'Password123!' });

    expect(response.status).toBe(403);
  });

  it('answers 415 for a non-JSON API body from an allowed origin', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', FRONT_ORIGIN)
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('username=owner%40acme.test&password=Password123!');

    expect(response.status).toBe(415);
    expect(response.body).toEqual({ message: 'Request body must be sent as application/json' });
  });
});

describe('Stripe webhook mount', () => {
  it('receives the raw body without an Origin and answers 400 on a bad signature', async () => {
    constructEvent.mockClear();

    const payload = '{"id":"evt_test","type":"invoice.paid"}';
    const response = await request(app)
      .post('/webhooks/v1/stripe')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', 't=1,v1=forged')
      .send(payload);

    //* Mounted before the Origin check (Stripe sends none) and before
    //* express.json() - the verifier gets the exact bytes Stripe signed
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Invalid webhook signature or payload' });
    expect(constructEvent).toHaveBeenCalledTimes(1);

    const [body, signature, secret] = constructEvent.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString('utf8')).toBe(payload);
    expect(signature).toBe('t=1,v1=forged');
    expect(secret).toBe('whsec_integration_test');
  });
});

describe('fallback 404', () => {
  it('answers JSON for an unknown GET', async () => {
    const response = await request(app).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ message: 'The requested route is not available or does not exist' });
  });

  it('answers JSON for an unknown POST (not Express\' HTML page)', async () => {
    const response = await request(app)
      .post('/does-not-exist')
      .set('Origin', FRONT_ORIGIN)
      .send({ any: 'thing' });

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({ message: 'The requested route is not available or does not exist' });
  });

  it('answers JSON for an unknown API route and does not expose the docs outside localhost', async () => {
    const unknown = await request(app).get('/api/v1/does-not-exist');
    const docs = await request(app).get('/api/docs.json');

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ message: 'The requested route is not available or does not exist' });
    expect(docs.status).toBe(404);
  });
});

describe('session cookie', () => {
  it('issues a Secure, HttpOnly, SameSite=None session cookie on login behind the TLS proxy', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4);
    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'owner@acme.test',
      role: 'user',
      company_id: '00000000-0000-4000-8000-0000000000c0',
      password: passwordHash,
    });

    authLimiterHits += 1;
    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', FRONT_ORIGIN)
      //* TRUST_PROXY=1: the reverse proxy terminated TLS - express-session
      //* only sends a Secure cookie over a secure request
      .set('X-Forwarded-Proto', 'https')
      .send({ username: 'owner@acme.test', password: 'Password123!' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: { id: '00000000-0000-4000-8000-000000000001', role: 'user' },
    });

    const cookies = response.headers['set-cookie'] ?? [];
    const sessionCookie = cookies.find((cookie) => cookie.startsWith('app.sid='));

    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toMatch(/;\s*HttpOnly/i);
    expect(sessionCookie).toMatch(/;\s*Secure/i);
    expect(sessionCookie).toMatch(/;\s*SameSite=None/i);
    expect(sessionCookie).toMatch(/;\s*Expires=/i);
    //* The session row is linked to the user so it can be revoked
    expect(prismaMock.session.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { user_id: '00000000-0000-4000-8000-000000000001' },
    }));
  });
});

const OWNER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@acme.test',
  role: 'user',
  company_id: '00000000-0000-4000-8000-0000000000c0',
};

//* Logs the seeded-like owner in and returns its session cookie. Counts
//* against authLimiter like any login
//* `clientIp` (sent as X-Forwarded-For, TRUST_PROXY=1) gives a spec its own
//* per-IP budgets - the global slow-down otherwise delays every request of
//* this file once the shared loopback IP passed 30 requests
const loginAsOwner = async (user = OWNER, { clientIp } = {}) => {
  prismaMock.user.findUnique.mockResolvedValueOnce({
    ...user,
    password: await bcrypt.hash('Password123!', 4),
  });

  if (!clientIp) authLimiterHits += 1;
  const login = request(app)
    .post('/api/v1/auth/login')
    .set('Origin', FRONT_ORIGIN)
    .set('X-Forwarded-Proto', 'https');
  if (clientIp) login.set('X-Forwarded-For', clientIp);
  const response = await login.send({ username: user.email, password: 'Password123!' });

  expect(response.status).toBe(200);

  return response.headers['set-cookie'].find((cookie) => cookie.startsWith('app.sid=')).split(';')[0];
};

describe('validated fields come from one location', () => {
  it('rejects login credentials sent only in the query string with 422, before any account lookup', async () => {
    prismaMock.user.findUnique.mockClear();

    authLimiterHits += 1;
    const response = await request(app)
      .post('/api/v1/auth/login?username=owner%40acme.test&password=Password123!')
      .set('Origin', FRONT_ORIGIN);

    expect(response.status).toBe(422);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('answers 422 (never 500) for checkout plan fields sent only in the query string', async () => {
    const cookie = await loginAsOwner();

    prismaMock.user.findUnique.mockResolvedValue(OWNER);
    prismaMock.userRole.findMany.mockResolvedValue([{
      Role: { name: 'company_owner', RolePermissions: [{ Permission: { name: 'billing.manage' } }] },
    }]);
    Object.values(stripeCalls).forEach((mock) => mock.mockClear());

    try {
      const response = await request(app)
        .post('/api/v1/billing/checkout-session?planName=pro&planBillingCycle=monthly')
        .set('Origin', FRONT_ORIGIN)
        .set('X-Forwarded-Proto', 'https')
        .set('Cookie', cookie)
        .send({});

      expect(response.status).toBe(422);
      Object.values(stripeCalls).forEach((mock) => expect(mock).not.toHaveBeenCalled());
    } finally {
      prismaMock.user.findUnique.mockReset();
      prismaMock.userRole.findMany.mockResolvedValue([]);
    }
  });
});

describe('access line request id', () => {
  it('carries the response X-Request-Id as reqId', async () => {
    const response = await request(app).get('/');
    const accessLine = await findAccessLine(response.headers['x-request-id']);

    expect(accessLine).toBeDefined();
    expect(accessLine.reqId).toMatch(UUID_PATTERN);
    expect(accessLine.res.statusCode).toBe(200);
  });

  it('matches the error-handler line requestId on a 500', async () => {
    const cookie = await loginAsOwner();

    //* The session's user lookup fails -> passport forwards the error -> 500
    prismaMock.user.findUnique.mockRejectedValueOnce(new Error('database exploded'));

    const response = await request(app)
      .get('/api/v1/user')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie);

    expect(response.status).toBe(500);

    const requestId = response.headers['x-request-id'];
    const accessLine = await findAccessLine(requestId);
    const errorLine = logLines.find((line) => line.context?.additionalInfo?.requestId === requestId);

    expect(accessLine).toBeDefined();
    expect(accessLine.res.statusCode).toBe(500);
    expect(errorLine).toBeDefined();
    expect(errorLine.context.additionalInfo.requestId).toBe(accessLine.reqId);
  });
});

describe('password change budget', () => {
  //* The session lookup returns the user; the password lookup (select
  //* password) returns its hash
  const servePasswordChangeUser = async (user) => {
    const passwordHash = await bcrypt.hash('Password123!', 4);

    prismaMock.user.findUnique.mockImplementation(async (args) => (
      args?.select?.password ? { password: passwordHash } : user
    ));
  };

  const changePassword = (cookie, currentPassword, newPassword = 'NewPassword123', clientIp = '203.0.113.10') => request(app)
    .patch('/api/v1/user/password')
    .set('Origin', FRONT_ORIGIN)
    .set('X-Forwarded-Proto', 'https')
    .set('X-Forwarded-For', clientIp)
    .set('Cookie', cookie)
    .send({ currentPassword, newPassword });

  afterEach(() => {
    prismaMock.user.findUnique.mockReset();
  });

  it('answers 429 on the 6th attempt after 5 wrong current passwords, even with the right one', async () => {
    const user = { ...OWNER, id: '00000000-0000-4000-8000-0000000000b1', email: 'guess@acme.test' };
    const cookie = await loginAsOwner(user, { clientIp: '203.0.113.10' });
    await servePasswordChangeUser(user);

    for (let attempt = 0; attempt < 5; attempt++) {
      const response = await changePassword(cookie, 'WrongPassword1');

      expect(response.status).toBe(400);
      expect(response.body.code).toBe('AUTH_CURRENT_PASSWORD_INCORRECT');
    }

    const throttled = await changePassword(cookie, 'Password123!');

    expect(throttled.status).toBe(429);
    expect(throttled.body).toEqual({ message: 'Too many failed password change attempts - please try again later' });
  });

  it('does not count unchanged-password rejections nor validation errors', async () => {
    const user = { ...OWNER, id: '00000000-0000-4000-8000-0000000000b2', email: 'careful@acme.test' };
    const cookie = await loginAsOwner(user, { clientIp: '203.0.113.11' });
    await servePasswordChangeUser(user);

    for (let attempt = 0; attempt < 6; attempt++) {
      const unchanged = await changePassword(cookie, 'Password123!', 'Password123!', '203.0.113.11');
      expect(unchanged.status).toBe(400);
      expect(unchanged.body.code).toBe('AUTH_PASSWORD_UNCHANGED');

      const invalid = await changePassword(cookie, 'Password123!', 'short', '203.0.113.11');
      expect(invalid.status).toBe(422);
    }

    const wrong = await changePassword(cookie, 'WrongPassword1', 'NewPassword123', '203.0.113.11');

    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe('AUTH_CURRENT_PASSWORD_INCORRECT');
  });
});

describe('login rate limiting', () => {
  it('mounts authLimiter on login - the IP budget runs out with 429', async () => {
    const statuses = [];

    //* Invalid bodies (422) still count against authLimiter, which runs first
    for (let attempt = 0; attempt < 12 && !statuses.includes(429); attempt++) {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .set('Origin', FRONT_ORIGIN)
        .send({ username: 'not-an-email' });

      statuses.push(response.status);

      if (response.status === 429) {
        expect(response.body).toEqual({ message: 'Too many authentication attempts - please try again later' });
        expect(response.headers.ratelimit).toBeDefined();
      }
    }

    const acceptedAttempts = statuses.filter((status) => status === 422).length;

    expect(statuses.at(-1)).toBe(429);
    expect(statuses.slice(0, -1).every((status) => status === 422)).toBe(true);
    expect(acceptedAttempts + authLimiterHits).toBe(10);
  });
});

describe('graceful shutdown', () => {
  it('flips the health probe to 503 once the shutdown started', async () => {
    markShuttingDown();

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'unavailable' });
  });
});
