import { describe, expect, it } from '@jest/globals';

const { helmetMiddleware, API_CONTENT_SECURITY_POLICY_DIRECTIVES } = await import('../server/middlewares/helmet.js');
const {
  buildDocsContentSecurityPolicyDirectives,
  docsContentSecurityPolicy,
} = await import('../server/middlewares/docsContentSecurityPolicy.js');

//* Runs a helmet middleware against a header-capturing res double
const collectHeaders = (middleware) => new Promise((resolve, reject) => {
  const headers = {};
  const res = {
    setHeader(name, value) { headers[name.toLowerCase()] = value; },
    getHeader(name) { return headers[name.toLowerCase()]; },
    removeHeader(name) { delete headers[name.toLowerCase()]; },
  };

  middleware({ method: 'GET', headers: {} }, res, (error) => (error ? reject(error) : resolve(headers)));
});

describe('API content security policy', () => {
  it('denies everything and forbids framing', async () => {
    const headers = await collectHeaders(helmetMiddleware);

    expect(headers['content-security-policy']).toBe("default-src 'none';frame-ancestors 'none'");
    expect(API_CONTENT_SECURITY_POLICY_DIRECTIVES).toEqual({
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
    });
  });
});

describe('docs content security policy', () => {
  it('allows only same-origin scripts - never inline or third-party ones', () => {
    const directives = buildDocsContentSecurityPolicyDirectives(undefined);

    expect(directives.scriptSrc).toEqual(["'self'"]);
    expect(directives.frameAncestors).toEqual(["'none'"]);
    expect(directives.connectSrc).toEqual(["'self'"]);
  });

  it('lets Try it out reach the public API origin of the spec', () => {
    expect(buildDocsContentSecurityPolicyDirectives('https://tunnel.example.com').connectSrc)
      .toEqual(["'self'", 'https://tunnel.example.com']);
  });

  it('replaces the API policy on the docs route', async () => {
    const headers = await collectHeaders(docsContentSecurityPolicy());

    expect(headers['content-security-policy']).toContain("script-src 'self'");
    expect(headers['content-security-policy']).toContain("style-src 'self' 'unsafe-inline'");
  });
});

describe('session lifetime', () => {
  it('is one constant of 24 hours', async () => {
    const { SESSION_TTL_MS } = await import('../server/config/security.js');

    expect(SESSION_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });
});
