import { describe, expect, it } from 'vitest';
import { restoreSubmitErrorKey } from './restorePasswordErrors.js';

const failure = (status) => ({ response: { status } });

describe('restoreSubmitErrorKey', () => {
  it('maps 400 (unknown, expired or used token) to the expired message', () => {
    expect(restoreSubmitErrorKey(failure(400))).toBe('auth.restore.errors.expired');
  });

  it('maps 422 to the invalid-input message', () => {
    expect(restoreSubmitErrorKey(failure(422))).toBe('auth.restore.errors.invalid');
  });

  it.each([[failure(404)], [failure(500)], [{}], [undefined]])('falls back to the generic message for %j', (err) => {
    expect(restoreSubmitErrorKey(err)).toBe('auth.restore.errors.generic');
  });
});
