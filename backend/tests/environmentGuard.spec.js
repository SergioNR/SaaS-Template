import { describe, expect, it } from '@jest/globals';

const { assertSafeDeployEnvironment } = await import('../server/config/environmentGuard.js');

describe('assertSafeDeployEnvironment', () => {
  it('refuses to boot a production process in localhost mode', () => {
    expect(() => assertSafeDeployEnvironment({
      NODE_ENV: 'production',
      DEPLOY_ENVIRONMENT: 'localhost',
    })).toThrow(/DEPLOY_ENVIRONMENT=localhost/);
  });

  it.each([
    [{ NODE_ENV: 'production', DEPLOY_ENVIRONMENT: 'production' }],
    [{ NODE_ENV: 'production' }],
    [{ NODE_ENV: 'development', DEPLOY_ENVIRONMENT: 'localhost' }],
    [{ NODE_ENV: 'test', DEPLOY_ENVIRONMENT: 'localhost' }],
    [{}],
  ])('allows %j', (env) => {
    expect(() => assertSafeDeployEnvironment(env)).not.toThrow();
  });
});
