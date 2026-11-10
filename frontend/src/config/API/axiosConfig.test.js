import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/hardRedirect.js', () => ({ hardRedirect: vi.fn() }));
vi.mock('../../utils/sessionCaches.js', () => ({ invalidateSessionCaches: vi.fn() }));

const { handleUnauthorized, resetUnauthorizedRedirect } = await import('./axiosConfig.js');
const { hardRedirect } = await import('../../utils/hardRedirect.js');
const { invalidateSessionCaches } = await import('../../utils/sessionCaches.js');

const axiosError = (status, url) => ({ response: { status }, config: { url } });

describe('401 interceptor', () => {
  beforeEach(() => {
    resetUnauthorizedRedirect();
    hardRedirect.mockClear();
    invalidateSessionCaches.mockClear();
    window.history.replaceState(null, '', '/user/team?tab=invites');
  });

  afterEach(() => {
    resetUnauthorizedRedirect();
  });

  it('redirects a 401 on a protected endpoint to login with next=<current path>', async () => {
    const error = axiosError(401, '/api/v1/team');

    await expect(handleUnauthorized(error)).rejects.toBe(error);

    expect(invalidateSessionCaches).toHaveBeenCalledTimes(1);
    expect(hardRedirect).toHaveBeenCalledWith(`/auth/login?next=${encodeURIComponent('/user/team?tab=invites')}`);
  });

  it('redirects only once when several requests fail together', async () => {
    await expect(handleUnauthorized(axiosError(401, '/api/v1/team'))).rejects.toBeDefined();
    await expect(handleUnauthorized(axiosError(401, '/api/v1/billing'))).rejects.toBeDefined();

    expect(hardRedirect).toHaveBeenCalledTimes(1);
  });

  it('leaves 401s from auth endpoints to the calling component', async () => {
    await expect(handleUnauthorized(axiosError(401, '/api/v1/auth/login'))).rejects.toBeDefined();
    await expect(handleUnauthorized(axiosError(401, '/api/v1/auth/session'))).rejects.toBeDefined();

    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it('does not redirect while already on an auth page', async () => {
    window.history.replaceState(null, '', '/auth/login');

    await expect(handleUnauthorized(axiosError(401, '/api/v1/team'))).rejects.toBeDefined();

    expect(hardRedirect).not.toHaveBeenCalled();
  });

  it.each([403, 404, 500, undefined])('ignores status %s', async (status) => {
    await expect(handleUnauthorized(axiosError(status, '/api/v1/team'))).rejects.toBeDefined();

    expect(hardRedirect).not.toHaveBeenCalled();
    expect(invalidateSessionCaches).not.toHaveBeenCalled();
  });
});
