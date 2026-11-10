import {
  requestLogger,
  resolveRequestLogLevel,
  resolveRouteLabel,
  resolveRequestRouteLabel,
  generateRequestId,
  requestLogProps,
  serializeRequest,
  serializeResponse,
  shouldSkipRequestLogging,
} from '../server/middlewares/requestLogger.js';

describe('resolveRequestLogLevel', () => {
  it.each([
    [200, undefined, 'info'],
    [304, undefined, 'info'],
    [404, undefined, 'warn'],
    [422, undefined, 'warn'],
    [429, undefined, 'warn'],
    [500, undefined, 'error'],
    [503, undefined, 'error'],
    [200, new Error('boom'), 'error'],
  ])('maps status %s%s to %s', (statusCode, err, expected) => {
    expect(resolveRequestLogLevel({}, { statusCode }, err)).toBe(expected);
  });
});

describe('serializeRequest', () => {
  it('strips the query string - password reset tokens travel in it', () => {
    const serialized = serializeRequest({
      method: 'GET',
      url: '/api/v1/auth/password-reset?token=super-secret-token',
    });

    expect(serialized).toEqual({
      method: 'GET',
      path: '/api/v1/auth/password-reset',
    });
    expect(JSON.stringify(serialized)).not.toContain('super-secret-token');
  });

  it('prefers originalUrl - sub-routers trim req.url', () => {
    expect(serializeRequest({ method: 'GET', originalUrl: '/api/v1/user?x=1', url: '/' })).toEqual({
      method: 'GET',
      path: '/api/v1/user',
    });
  });

  it('keeps paths without a query string intact and tolerates a missing url', () => {
    expect(serializeRequest({ method: 'POST', url: '/api/v1/auth/login' })).toEqual({
      method: 'POST',
      path: '/api/v1/auth/login',
    });
    expect(serializeRequest({ method: 'GET' })).toEqual({ method: 'GET', path: '' });
  });
});

describe('serializeResponse', () => {
  it('emits only the status code', () => {
    expect(serializeResponse({ statusCode: 201, body: 'secret' })).toEqual({ statusCode: 201 });
  });
});

describe('shouldSkipRequestLogging', () => {
  it('skips /health (container health probes) with or without query string', () => {
    expect(shouldSkipRequestLogging({ url: '/health' })).toBe(true);
    expect(shouldSkipRequestLogging({ url: '/health?probe=1' })).toBe(true);
  });

  it('logs every other path, including /health-prefixed ones', () => {
    expect(shouldSkipRequestLogging({ url: '/healthz' })).toBe(false);
    expect(shouldSkipRequestLogging({ url: '/api/v1/auth/login' })).toBe(false);
    expect(shouldSkipRequestLogging({})).toBe(false);
  });
});

describe('requestLogger', () => {
  it('returns an Express middleware bound to the shared logger', () => {
    expect(typeof requestLogger()).toBe('function');
  });
});

describe('resolveRouteLabel', () => {
  it('names the method and the full route pattern for nested parameterized routes', () => {
    expect(resolveRouteLabel(
      'PATCH',
      '/api/v1/team/members/00000000-0000-4000-8000-0000000000aa',
      '/members/:userId',
    )).toBe('PATCH /api/v1/team/members/:userId');
  });

  it('keeps multiple leaf placeholders in order', () => {
    expect(resolveRouteLabel(
      'POST',
      '/api/v1/team/invites/00000000-0000-4000-8000-0000000000bb/resend',
      '/invites/:inviteId/resend',
    )).toBe('POST /api/v1/team/invites/:inviteId/resend');
  });

  it('names static leaf segments as-is', () => {
    expect(resolveRouteLabel('POST', '/api/v1/auth/login', '/login'))
      .toBe('POST /api/v1/auth/login');
  });

  it('joins the mount prefix for a root-route leaf', () => {
    expect(resolveRouteLabel('GET', '/api/v1/files', '/'))
      .toBe('GET /api/v1/files');
  });

  it('normalizes trailing slashes on the concrete path', () => {
    expect(resolveRouteLabel(
      'GET',
      '/api/v1/admin/users/00000000-0000-4000-8000-0000000000aa/',
      '/:userId',
    )).toBe('GET /api/v1/admin/users/:userId');
  });

  it('falls back to the concrete path when no route matched (fallback 404)', () => {
    expect(resolveRouteLabel(
      'GET',
      '/api/v1/does-not-exist?token=super-secret-token',
      undefined,
    )).toBe('GET /api/v1/does-not-exist');
  });

  it('logs the concrete path for the wildcard fallback routes', () => {
    expect(resolveRouteLabel('POST', '/nope/deeper?x=1', '/*fallback')).toBe('POST /nope/deeper');
  });

  it('answers the bare root for the site root request', () => {
    expect(resolveRouteLabel('GET', '/', undefined)).toBe('GET /');
  });

  it('collapses to the placeholder pattern when the leaf exactly spans the path', () => {
    expect(resolveRouteLabel('GET', '/00000000-0000-4000-8000-0000000000ee', '/:fileId'))
      .toBe('GET /:fileId');
  });

  it('degrades to the concrete path when the leaf cannot fit the path', () => {
    expect(resolveRouteLabel('GET', '/api', '/:id/:subId')).toBe('GET /api');
  });
});

describe('resolveRequestRouteLabel', () => {
  it('uses originalUrl and the matched route pattern', () => {
    const req = {
      method: 'DELETE',
      originalUrl: '/api/v1/team/members/00000000-0000-4000-8000-0000000000cc?extra=1',
      url: '/members/00000000-0000-4000-8000-0000000000cc',
      route: { path: '/members/:userId' },
    };

    expect(resolveRequestRouteLabel(req)).toBe('DELETE /api/v1/team/members/:userId');
  });

  it('keeps the same label after an error unwind (route persists, url restored)', () => {
    const req = {
      method: 'PATCH',
      originalUrl: '/api/v1/team/members/00000000-0000-4000-8000-0000000000dd',
      url: '/api/v1/team/members/00000000-0000-4000-8000-0000000000dd',
      route: { path: '/members/:userId' },
    };

    expect(resolveRequestRouteLabel(req)).toBe('PATCH /api/v1/team/members/:userId');
  });
});

describe('generateRequestId', () => {
  it('returns a fresh uuid and echoes it as the X-Request-Id header', () => {
    const headers = {};
    const res = { setHeader: (name, value) => { headers[name] = value; } };

    const requestId = generateRequestId({}, res);

    expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(headers['X-Request-Id']).toBe(requestId);
  });

  it('never reuses a value - a client-supplied x-request-id is not read', () => {
    const first = generateRequestId({}, { setHeader: () => {} });
    const second = generateRequestId({ headers: { 'x-request-id': 'spoofed' } }, { setHeader: () => {} });

    expect(second).not.toBe(first);
    expect(second).not.toBe('spoofed');
  });
});

describe('requestLogProps', () => {
  it('carries the acting user, its company and the client ip', () => {
    expect(requestLogProps({
      user: { id: '00000000-0000-4000-8000-000000000001', company_id: '00000000-0000-4000-8000-0000000000c0' },
      ip: '10.0.0.9',
    })).toEqual({
      userId: '00000000-0000-4000-8000-000000000001',
      companyId: '00000000-0000-4000-8000-0000000000c0',
      ip: '10.0.0.9',
    });
  });

  it('stays null-safe for unauthenticated requests', () => {
    expect(requestLogProps({ ip: '127.0.0.1' })).toEqual({
      userId: null,
      companyId: null,
      ip: '127.0.0.1',
    });
  });
});
