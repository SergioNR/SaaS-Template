import { describe, expect, it } from 'vitest';
import { subscriptionStatus } from './subscriptionStatus.js';

const PAST = '2000-01-01T00:00:00Z';
const FUTURE = '2999-01-01T00:00:00Z';

describe('subscriptionStatus', () => {
  it.each(['paid', 'trial', 'inactive'])('returns the server status %s as is', (status) => {
    //* The dates never override the server (clock skew)
    expect(subscriptionStatus({ status, expires_at: PAST })).toBe(status);
  });

  it('treats an unknown status value as inactive', () => {
    expect(subscriptionStatus({ status: 'weird', expires_at: FUTURE })).toBe('inactive');
  });

  it('treats a payload without status as inactive', () => {
    expect(subscriptionStatus({ expires_at: FUTURE })).toBe('inactive');
  });

  it('treats a missing subscription as inactive', () => {
    expect(subscriptionStatus(null)).toBe('inactive');
  });
});
