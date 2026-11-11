import { jest } from '@jest/globals';

const rateLimitMock = jest.fn();

jest.unstable_mockModule('express-rate-limit', () => ({
  default: rateLimitMock,
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logRateLimited: jest.fn(),
  logWarn: jest.fn(),
}));

rateLimitMock.mockImplementation((options) => options);

const { passwordResetLimiter } = await import('../server/middlewares/passwordResetRateLimiter.js');
const { authLimiter } = await import('../server/middlewares/authRateLimiter.js');

describe('passwordResetRateLimiter', () => {
  it('uses its own 1 hour / 5 request budget, separate from authLimiter', () => {
    expect(passwordResetLimiter.windowMs).toBe(60 * 60 * 1000);
    expect(passwordResetLimiter.limit).toBe(5);
    expect(authLimiter.windowMs).toBe(15 * 60 * 1000);
    expect(authLimiter.limit).toBe(10);
    expect(authLimiter).not.toBe(passwordResetLimiter);
  });

  it('responds 429 with a password-reset specific message when the budget is exhausted', () => {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    passwordResetLimiter.handler({ ip: '203.0.113.7' }, res);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Too many password reset requests - please try again later',
    });
  });
});
