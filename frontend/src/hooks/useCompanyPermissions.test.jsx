import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('../config/API/axiosConfig.js', () => ({ default: { get: vi.fn() } }));

const { default: apiClient } = await import('../config/API/axiosConfig.js');
const { fetchCompanyPermissions, useCompanyPermissions } = await import('./useCompanyPermissions.js');
const { getSessionGeneration, invalidateSessionCaches, registerSessionCache } =
  await import('../utils/sessionCaches.js');

//* A promise the test resolves/rejects by hand, to order in-flight requests
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const teamResponse = (callerPermissions) => ({ data: { callerPermissions } });

describe('sessionCaches', () => {
  it('runs every registered reset and bumps the generation', () => {
    const reset = vi.fn();
    const unregister = registerSessionCache(reset);
    const before = getSessionGeneration();

    invalidateSessionCaches();

    expect(reset).toHaveBeenCalledTimes(1);
    expect(getSessionGeneration()).toBe(before + 1);

    unregister();
    invalidateSessionCaches();
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('useCompanyPermissions cache', () => {
  beforeEach(() => {
    invalidateSessionCaches();
    apiClient.get.mockReset();
  });

  it('fetches /api/v1/team once per session', async () => {
    apiClient.get.mockResolvedValue(teamResponse(['billing.manage']));

    await expect(fetchCompanyPermissions()).resolves.toEqual(['billing.manage']);
    await expect(fetchCompanyPermissions()).resolves.toEqual(['billing.manage']);

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/team');
  });

  it('refetches after the session caches are invalidated', async () => {
    apiClient.get.mockResolvedValueOnce(teamResponse(['team.invite']));
    apiClient.get.mockResolvedValueOnce(teamResponse([]));

    await expect(fetchCompanyPermissions()).resolves.toEqual(['team.invite']);
    invalidateSessionCaches();
    await expect(fetchCompanyPermissions()).resolves.toEqual([]);

    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('never serves the previous session an in-flight result to the next one', async () => {
    const oldSession = deferred();
    apiClient.get.mockReturnValueOnce(oldSession.promise);
    apiClient.get.mockResolvedValueOnce(teamResponse([]));

    const oldRequest = fetchCompanyPermissions();
    invalidateSessionCaches();
    const newRequest = fetchCompanyPermissions();

    oldSession.resolve(teamResponse(['billing.manage']));

    await expect(oldRequest).resolves.toEqual(['billing.manage']);
    await expect(newRequest).resolves.toEqual([]);
    await expect(fetchCompanyPermissions()).resolves.toEqual([]);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('a stale failure does not evict the newer session cache', async () => {
    const oldSession = deferred();
    apiClient.get.mockReturnValueOnce(oldSession.promise);
    apiClient.get.mockResolvedValueOnce(teamResponse(['team.remove']));

    const oldRequest = fetchCompanyPermissions();
    invalidateSessionCaches();
    await expect(fetchCompanyPermissions()).resolves.toEqual(['team.remove']);

    oldSession.reject(new Error('network'));
    await expect(oldRequest).resolves.toBeNull();

    //* Still cached - the old request's .catch must not have cleared it
    await expect(fetchCompanyPermissions()).resolves.toEqual(['team.remove']);
    expect(apiClient.get).toHaveBeenCalledTimes(2);
  });

  it('a failed fetch resolves to null and is retried on the next call', async () => {
    apiClient.get.mockRejectedValueOnce(new Error('network'));
    apiClient.get.mockResolvedValueOnce(teamResponse(['team.invite']));

    await expect(fetchCompanyPermissions()).resolves.toBeNull();
    await expect(fetchCompanyPermissions()).resolves.toEqual(['team.invite']);
  });

  it('the hook drops a result that arrives after a session change', async () => {
    const oldSession = deferred();
    apiClient.get.mockReturnValueOnce(oldSession.promise);

    const { result } = renderHook(() => useCompanyPermissions());

    expect(result.current.loading).toBe(true);

    act(() => {
      invalidateSessionCaches();
    });

    await act(async () => {
      oldSession.resolve(teamResponse(['billing.manage']));
      await oldSession.promise;
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.has('billing.manage')).toBe(false);
  });

  it('the hook exposes loaded permissions', async () => {
    apiClient.get.mockResolvedValue(teamResponse(['billing.manage']));

    const { result } = renderHook(() => useCompanyPermissions());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.failed).toBe(false);
    expect(result.current.has('billing.manage')).toBe(true);
    expect(result.current.has('team.invite')).toBe(false);
  });
});
