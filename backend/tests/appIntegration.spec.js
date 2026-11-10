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
  },
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/brevo.js', () => ({
  brevoClient: { transactionalEmails: { sendTransacEmail: jest.fn().mockResolvedValue({}) } },
  companyEmails: { support: 'support@acme.test', billing: 'support@acme.test', hello: 'support@acme.test' },
  templateIds: { resetPassword: 2, teamInvite: 3 },
  commonTemplateParams: () => ({ appOrigin: FRONT_ORIGIN }),
  frontendUrl: (path) => `${FRONT_ORIGIN}${path}`,
}));

//* The real express-session runs on an in-memory store instead of Postgres
jest.unstable_mockModule('@quixo3/prisma-session-store', () => ({
  PrismaSessionStore: class extends session.MemoryStore {},
}));

//* Silent logger - the access log middleware still runs, nothing is printed
jest.unstable_mockModule('../server/config/logger.js', () => ({
  logger: pino({ level: 'silent' }),
}));

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
      email_verified_at: new Date(),
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

//* Logs the seeded-shaped owner in and returns the Cookie header to replay -
//* the cookie is Secure, so it is forwarded by hand over the test transport.
//* Counts against authLimiter like any login
const OWNER = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'owner@acme.test',
  role: 'user',
  company_id: '00000000-0000-4000-8000-0000000000c0',
};

const loginAsOwner = async () => {
  const passwordHash = await bcrypt.hash('Password123!', 4);
  prismaMock.user.findUnique.mockResolvedValueOnce({ ...OWNER, email_verified_at: new Date(), password: passwordHash });

  authLimiterHits += 1;
  const response = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', FRONT_ORIGIN)
    .set('X-Forwarded-Proto', 'https')
    .send({ username: OWNER.email, password: 'Password123!' });

  expect(response.status).toBe(200);

  const sessionCookie = (response.headers['set-cookie'] ?? []).find((cookie) => cookie.startsWith('app.sid='));

  return sessionCookie.split(';')[0];
};

describe('auth router gating', () => {
  const ROUTE_NOT_FOUND = { message: 'The requested route is not available or does not exist' };

  it('answers 404 to an unknown auth path without a session', async () => {
    const getResponse = await request(app).get('/api/v1/auth/nope');
    const postResponse = await request(app)
      .post('/api/v1/auth/registr')
      .set('Origin', FRONT_ORIGIN)
      .send({});

    expect(getResponse.status).toBe(404);
    expect(getResponse.body).toEqual(ROUTE_NOT_FOUND);
    expect(postResponse.status).toBe(404);
    expect(postResponse.body).toEqual(ROUTE_NOT_FOUND);
  });

  it('still answers 401 to the private auth routes without a session', async () => {
    const sessionCheck = await request(app).get('/api/v1/auth/session');
    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Origin', FRONT_ORIGIN)
      .send({});

    expect(sessionCheck.status).toBe(401);
    expect(sessionCheck.body).toEqual({});
    expect(logout.status).toBe(401);
    expect(logout.body).toEqual({});
  });

  it('answers 404 to an unknown auth path with a session, and 200 to the session check', async () => {
    const cookie = await loginAsOwner();
    prismaMock.user.findUnique.mockResolvedValue(OWNER);

    const unknown = await request(app)
      .get('/api/v1/auth/nope')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie);
    const sessionCheck = await request(app)
      .get('/api/v1/auth/session')
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie);
    //* The deprecated alias was removed - it is an unknown path now
    const removedAlias = await request(app)
      .patch('/api/v1/auth/update-user-password')
      .set('Origin', FRONT_ORIGIN)
      .set('X-Forwarded-Proto', 'https')
      .set('Cookie', cookie)
      .send({ currentPassword: 'Password123!', newPassword: 'Password456!' });

    prismaMock.user.findUnique.mockReset();

    expect(removedAlias.status).toBe(404);
    expect(removedAlias.body).toEqual(ROUTE_NOT_FOUND);
    expect(prismaMock.user.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ password: expect.anything() }),
    }));

    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual(ROUTE_NOT_FOUND);
    expect(sessionCheck.status).toBe(200);
    expect(sessionCheck.body).toEqual({ user: { id: OWNER.id, role: 'user' } });
  });
});

describe('email verification routes', () => {
  it('validates the verification token (422) under the shared credential budget', async () => {
    authLimiterHits += 1;
    const response = await request(app)
      .post('/api/v1/auth/email-verification')
      .set('Origin', FRONT_ORIGIN)
      .send({ emailVerificationToken: 'not-a-token' });

    expect(response.status).toBe(422);
  });

  it('answers the fixed 200 to a resend and throttles the 6th request per hour with 429', async () => {
    const statuses = [];

    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await request(app)
        .post('/api/v1/auth/email-verification/resend')
        .set('Origin', FRONT_ORIGIN)
        .send({ email: 'nobody@acme.test' });

      statuses.push(response.status);

      if (response.status === 200) {
        expect(response.body).toEqual({
          message: 'If this email belongs to an unverified account, a new verification link will be sent',
        });
      }
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
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
