import { jest } from '@jest/globals';

const client = {
  capture: jest.fn(),
  groupIdentify: jest.fn(),
};

jest.unstable_mockModule('../server/config/posthog-node.js', () => ({
  client,
}));

const logError = jest.fn();

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError,
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const {
  posthogUserSignedUp,
  posthogUserSuccessLoggedIn,
  posthogUserDeleteAccount,
} = await import('../server/models/posthogModel.js');

const user = { id: 'user-1', email: 'owner@acme.test', company_id: 'company-1' };

describe('posthog events - fire-and-forget invariant', () => {
  beforeEach(() => {
    client.capture.mockReset();
    client.groupIdentify.mockReset();
    logError.mockClear();
  });

  it('posthogUserSignedUp captures the event without touching company groups by default', async () => {
    client.capture.mockResolvedValue(undefined);

    await posthogUserSignedUp(user);

    expect(client.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'user-1',
      event: 'userSignedUp',
      groups: { company: 'company-1' },
    }));
    expect(client.groupIdentify).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });

  it('posthogUserSignedUp identifies the company only for self-registration', async () => {
    await posthogUserSignedUp(user, { createdCompany: true, companyName: 'Acme Corp' });

    expect(client.groupIdentify).toHaveBeenCalledWith({
      groupType: 'company',
      groupKey: 'company-1',
      properties: { name: 'Acme Corp', subscription: 'free trial' },
    });
  });

  it('posthogUserSignedUp falls back to "unknown" without a company name', async () => {
    await posthogUserSignedUp(user, { createdCompany: true });

    expect(client.groupIdentify).toHaveBeenCalledWith(expect.objectContaining({
      properties: { name: 'unknown', subscription: 'free trial' },
    }));
  });

  it.each([
    ['signup', () => posthogUserSignedUp(user)],
    ['login', () => posthogUserSuccessLoggedIn('user-1', 'local')],
    ['delete', () => posthogUserDeleteAccount('user-1')],
  ])('%s event resolves instead of throwing when PostHog fails', async (_name, send) => {
    const posthogError = new Error('posthog down');

    //* The model calls capture without await (posthog-node queues internally),
    //* so the guarded failure surface is a synchronous throw
    client.capture.mockImplementation(() => {
      throw posthogError;
    });

    await expect(send()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    const [message, error] = logError.mock.calls[0];
    expect(message).toContain('error sending');
    expect(error).toBe(posthogError);
  });

  it('posthogUserSuccessLoggedIn pins distinctId and login method', async () => {
    client.capture.mockResolvedValue(undefined);

    await posthogUserSuccessLoggedIn('user-1', 'local');

    expect(client.capture).toHaveBeenCalledWith(expect.objectContaining({
      distinctId: 'user-1',
      event: 'userLoggedIn',
      properties: { loginMethod: 'local' },
    }));
  });

  it('posthogUserDeleteAccount marks the user deleted and unsets the email', async () => {
    client.capture.mockResolvedValue(undefined);

    await posthogUserDeleteAccount('user-1');

    const [payload] = client.capture.mock.calls[0];
    expect(payload.distinctId).toBe('user-1');
    expect(payload.properties.$set).toEqual({ isDeleted: true });
    expect(payload.properties.$unset).toEqual(['email']);
  });
});
