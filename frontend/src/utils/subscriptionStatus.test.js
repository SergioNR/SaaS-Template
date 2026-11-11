import { describe, expect, it } from 'vitest';
import { subscriptionStatus } from './subscriptionStatus.js';

const NOW = new Date('2026-11-12T00:00:00Z');
const FUTURE = '2026-12-01T00:00:00Z';
const PAST = '2026-10-01T00:00:00Z';

describe('subscriptionStatus', () => {
  it.each(['paid', 'trial', 'inactive'])('returns the server status %s as is', (status) => {
    //* Even when the dates would say otherwise (clock skew)
    expect(subscriptionStatus({ status, expires_at: PAST, is_paid: true }, NOW)).toBe(status);
  });

  it('ignores an unknown status value and falls back to the dates', () => {
    expect(subscriptionStatus({ status: 'weird', expires_at: FUTURE, is_paid: false }, NOW)).toBe('trial');
  });

  it.each([
    ['paid', { expires_at: FUTURE, is_paid: true }],
    ['trial', { expires_at: FUTURE, is_paid: false }],
    ['active', { expires_at: FUTURE }],
    ['inactive', { expires_at: PAST, is_paid: true }],
    ['inactive', { expires_at: null }],
  ])('falls back to %s without a server status', (expected, subscription) => {
    expect(subscriptionStatus(subscription, NOW)).toBe(expected);
  });

  it('treats a missing subscription as inactive', () => {
    expect(subscriptionStatus(null, NOW)).toBe('inactive');
  });
});
