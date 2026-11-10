import { describe, expect, it } from '@jest/globals';
import { isSeedAllowed } from '../prisma/seedGuard.js';

describe('isSeedAllowed', () => {
  it('allows local development databases', () => {
    expect(isSeedAllowed({ DEPLOY_ENVIRONMENT: 'localhost' })).toBe(true);
  });

  it('allows an explicit ALLOW_SEED=1 opt-in anywhere', () => {
    expect(isSeedAllowed({ DEPLOY_ENVIRONMENT: 'production', ALLOW_SEED: '1' })).toBe(true);
  });

  it.each([
    [{}],
    [{ DEPLOY_ENVIRONMENT: 'production' }],
    [{ DEPLOY_ENVIRONMENT: 'staging', ALLOW_SEED: 'true' }],
    [{ ALLOW_SEED: '0' }],
  ])('refuses %j', (env) => {
    expect(isSeedAllowed(env)).toBe(false);
  });
});
