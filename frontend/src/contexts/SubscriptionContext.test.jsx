import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';

vi.mock('../config/API/axiosConfig.js', () => ({ default: { get: vi.fn() } }));

const { default: apiClient } = await import('../config/API/axiosConfig.js');
const { SubscriptionProvider } = await import('./SubscriptionContext.jsx');
const { useSubscription } = await import('./useSubscription.js');

const failure = (status, code) => Object.assign(new Error('request failed'), { response: { status, data: { code } } });

const renderProvider = () => {
  const latest = { current: null };

  const Probe = () => {
    latest.current = useSubscription();
    return null;
  };

  render(
    <SubscriptionProvider>
      <Probe />
    </SubscriptionProvider>,
  );

  return latest;
};

describe('SubscriptionProvider error kinds', () => {
  beforeEach(() => {
    apiClient.get.mockReset();
  });

  it('treats 404 as a valid "no subscription" state, not an error', async () => {
    apiClient.get.mockRejectedValue(failure(404));

    const latest = renderProvider();

    await waitFor(() => expect(latest.current.loading).toBe(false));
    expect(latest.current.error).toBeNull();
    expect(latest.current.errorKind).toBeNull();
    expect(latest.current.hasActiveSubscription).toBe(false);
  });

  it('flags 403 COMPANY_MEMBERSHIP_REQUIRED as a membership error', async () => {
    apiClient.get.mockRejectedValue(failure(403, 'COMPANY_MEMBERSHIP_REQUIRED'));

    const latest = renderProvider();

    await waitFor(() => expect(latest.current.errorKind).toBe('membership'));
    expect(latest.current.error).toEqual(expect.any(String));
  });

  it.each([[failure(500)], [new Error('Network Error')]])('flags %s as a retryable load error', async (err) => {
    apiClient.get.mockRejectedValue(err);

    const latest = renderProvider();

    await waitFor(() => expect(latest.current.errorKind).toBe('load'));
  });

  it('a silent refresh failure keeps the last good data and never sets an error', async () => {
    apiClient.get.mockResolvedValueOnce({
      data: { subscriptionData: { status: 'paid', is_paid: true, expires_at: '2999-01-01T00:00:00Z' } },
    });

    const latest = renderProvider();

    await waitFor(() => expect(latest.current.hasPaidSubscription).toBe(true));

    apiClient.get.mockRejectedValueOnce(failure(500));
    await act(() => latest.current.refresh({ silent: true }));

    expect(latest.current.hasPaidSubscription).toBe(true);
    expect(latest.current.errorKind).toBeNull();
  });
});
