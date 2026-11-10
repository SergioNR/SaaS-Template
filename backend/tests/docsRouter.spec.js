import { describe, expect, it } from '@jest/globals';

const { docsRouter } = await import('../server/routers/docsRouter.js');

//* Drives the router directly with minimal req/res doubles - no HTTP server
const dispatch = (method, url) => new Promise((resolve) => {
  const res = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { resolve({ handled: true, statusCode: this.statusCode, body }); return this; },
  };
  const req = {
    method,
    url,
    originalUrl: url,
    headers: {},
  };

  docsRouter(req, res, () => resolve({ handled: false }));
});

describe('docsRouter', () => {
  it('serves the OpenAPI spec at /docs.json', async () => {
    const result = await dispatch('GET', '/docs.json');

    expect(result.handled).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.body).toHaveProperty('openapi');
  });

  it.each([
    ['GET', '/v1/user'],
    ['POST', '/v1/auth/login'],
    ['DELETE', '/v1/team/members/x'],
  ])('lets %s %s fall through to the API router', async (method, url) => {
    await expect(dispatch(method, url)).resolves.toEqual({ handled: false });
  });
});
