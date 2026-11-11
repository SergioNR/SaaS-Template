import { describe, expect, it } from 'vitest';
import { resendFailureKey, verifyFailureState } from './emailVerification.js';

const failure = (status) => ({ response: { status } });

describe('verifyFailureState', () => {
  it.each([400, 422])('treats %s as an invalid link', (status) => {
    expect(verifyFailureState(failure(status))).toBe('invalid');
  });

  it.each([[failure(500)], [failure(429)], [{}]])('treats %j as retryable', (err) => {
    expect(verifyFailureState(err)).toBe('error');
  });
});

describe('resendFailureKey', () => {
  it('maps 422 to the invalid-email message', () => {
    expect(resendFailureKey(failure(422))).toBe('auth.resendVerification.errors.invalid');
  });

  it('maps 429 to the too-many-attempts message', () => {
    expect(resendFailureKey(failure(429))).toBe('auth.errors.tooManyAttempts');
  });

  it('falls back to the generic message', () => {
    expect(resendFailureKey({})).toBe('auth.resendVerification.errors.generic');
  });
});
