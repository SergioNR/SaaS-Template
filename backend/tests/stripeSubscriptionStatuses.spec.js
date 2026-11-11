import { storedSubscriptionStatus, toPublicSubscription } from '../server/config/stripeSubscriptionStatuses.js';

const NOW = new Date('2026-11-12T00:00:00Z');
const FUTURE = new Date('2026-12-01T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');

describe('storedSubscriptionStatus', () => {
  it.each([
    ['Stripe-backed, future expiry', { stripe_subscription_id: 'sub_1', expires_at: FUTURE }, 'paid'],
    ['Stripe-backed, past expiry', { stripe_subscription_id: 'sub_1', expires_at: PAST }, 'inactive'],
    ['trial, future expiry', { stripe_subscription_id: null, expires_at: FUTURE }, 'trial'],
    ['trial, past expiry', { stripe_subscription_id: null, expires_at: PAST }, 'inactive'],
    ['no expiry', { stripe_subscription_id: 'sub_1', expires_at: null }, 'inactive'],
    ['no row', null, 'inactive'],
  ])('%s → %s', (_label, row, expected) => {
    expect(storedSubscriptionStatus(row, NOW)).toBe(expected);
  });
});

describe('toPublicSubscription', () => {
  it('drops the row id and the Stripe id and adds status + is_paid', () => {
    const result = toPublicSubscription({
      id: 'row-uuid', stripe_subscription_id: 'sub_secret', expires_at: FUTURE, created_at: PAST,
    }, NOW);

    expect(result).toEqual({
      expires_at: FUTURE, created_at: PAST, status: 'paid', is_paid: true,
    });
    expect(JSON.stringify(result)).not.toContain('sub_secret');
  });

  it('keeps null for a missing row', () => {
    expect(toPublicSubscription(null)).toBeNull();
  });
});
