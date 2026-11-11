import { jest } from '@jest/globals';

const rateLimitMock = jest.fn((options) => options);
//* Stands in for the library's IPv6 subnet masking so the test can tell the
//* masked key apart from the raw address
const ipKeyGeneratorMock = jest.fn((ip) => (ip.includes(':') ? `${ip.split(':').slice(0, 3).join(':')}::/56` : ip));
const slowDownMock = jest.fn((options) => options);

jest.unstable_mockModule('express-rate-limit', () => ({
  default: rateLimitMock,
  ipKeyGenerator: ipKeyGeneratorMock,
}));

jest.unstable_mockModule('express-slow-down', () => ({
  slowDown: slowDownMock,
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logRateLimited: jest.fn(),
  logWarn: jest.fn(),
}));

const { loginAccountLimiter, loginAccountKey } = await import('../server/middlewares/loginAccountRateLimiter.js');
const { slowLimiter } = await import('../server/middlewares/express-slow-down.js');

describe('loginAccountLimiter', () => {
  it('allows 5 failed attempts per account per 15 minutes and skips successful logins', () => {
    expect(loginAccountLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(loginAccountLimiter.limit).toBe(5);
    expect(loginAccountLimiter.skipSuccessfulRequests).toBe(true);
  });

  it('keys on the normalized username together with the client IP', () => {
    const keyA = loginAccountKey({ ip: '203.0.113.1', body: { username: ' User@Example.com ' } });
    const keySameIp = loginAccountKey({ ip: '203.0.113.1', body: { username: 'user@example.com' } });
    const keyOtherIp = loginAccountKey({ ip: '198.51.100.2', body: { username: 'user@example.com' } });

    expect(keyA).toBe(keySameIp);
    expect(keyA).toBe('login:203.0.113.1:user@example.com');
    //* Another source cannot burn the budget of the account for everyone
    expect(keyOtherIp).not.toBe(keyA);
  });

  it('builds the key from the ipKeyGenerator output, not the raw IPv6 address', () => {
    const key = loginAccountKey({ ip: '2001:db8:1234:5678::1', body: { username: 'user@example.com' } });

    expect(ipKeyGeneratorMock).toHaveBeenCalledWith('2001:db8:1234:5678::1');
    expect(key).toBe('login:2001:db8:1234::/56:user@example.com');
    //* Another address of the same IPv6 block shares the budget
    expect(loginAccountKey({ ip: '2001:db8:1234:9999::2', body: { username: 'user@example.com' } })).toBe(key);
  });

  it('responds 429 when the account budget is exhausted', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    loginAccountLimiter.handler({ ip: '203.0.113.7' }, res);

    expect(res.status).toHaveBeenCalledWith(429);
  });
});

describe('slowLimiter', () => {
  it('delays relative to delayAfter and caps the delay', () => {
    const req = { slowDown: { limit: slowLimiter.delayAfter } };

    expect(slowLimiter.delayMs(31, req)).toBe(100);
    expect(slowLimiter.delayMs(35, req)).toBe(500);
    expect(slowLimiter.maxDelayMs).toBe(2000);
  });
});
