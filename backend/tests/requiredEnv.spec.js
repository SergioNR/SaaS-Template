import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logWarn: jest.fn(),
}));

const { requireEnv, isLocalhost } = await import('../server/config/requiredEnv.js');
const { logWarn } = await import('../server/config/loggerFunctions.js');

describe('requireEnv', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.SOME_REQUIRED_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns true when the variable is set, in any environment', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    process.env.SOME_REQUIRED_KEY = 'value';

    expect(requireEnv('SOME_REQUIRED_KEY', 'reason')).toBe(true);
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('throws outside localhost when the variable is missing, naming it and the reason', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';

    expect(() => requireEnv('SOME_REQUIRED_KEY', 'refusing to start without it'))
      .toThrow('SOME_REQUIRED_KEY environment variable is not set - refusing to start without it');
  });

  it('treats an unset DEPLOY_ENVIRONMENT as deployed (fail fast)', () => {
    delete process.env.DEPLOY_ENVIRONMENT;

    expect(isLocalhost()).toBe(false);
    expect(() => requireEnv('SOME_REQUIRED_KEY', 'reason')).toThrow();
  });

  it('treats an empty string as missing', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    process.env.SOME_REQUIRED_KEY = '';

    expect(() => requireEnv('SOME_REQUIRED_KEY', 'reason')).toThrow();
  });

  it('only warns and returns false on localhost so local development boots', () => {
    process.env.DEPLOY_ENVIRONMENT = 'localhost';

    expect(requireEnv('SOME_REQUIRED_KEY', 'reason')).toBe(false);
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('SOME_REQUIRED_KEY'));
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('ignored on localhost'));
  });
});
