import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/integrations/telegram/sendBusinessEventsToTelegram.js', () => ({
  isBusinessEventsChannelConfigured: jest.fn(() => true),
  sendBusinessEventToTelegram: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule('../server/models/companyModel.js', () => ({
  getCompanyByIdInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/subscriptionModel.js', () => ({
  getSubscriptionDataInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  countUsersInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));

const {
  notifyCompanyRegistered,
  notifyInviteAccepted,
  notifySubscriptionTransition,
  notifyUserDeleted,
} = await import('../server/utils/businessEvents.js');
const {
  isBusinessEventsChannelConfigured,
  sendBusinessEventToTelegram,
} = await import('../server/integrations/telegram/sendBusinessEventsToTelegram.js');
const { getCompanyByIdInDb } = await import('../server/models/companyModel.js');
const { getSubscriptionDataInDb } = await import('../server/models/subscriptionModel.js');
const { countUsersInDb } = await import('../server/models/userModel.js');
const { logError, logWarn } = await import('../server/config/loggerFunctions.js');

const TRIAL_END = new Date('2030-01-08T00:00:00Z');
const FUTURE = new Date('2030-02-01T00:00:00Z');

describe('businessEvents notifiers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isBusinessEventsChannelConfigured.mockReturnValue(true);
    getCompanyByIdInDb.mockResolvedValue({ id: 'company-1', name: 'Acme Corp' });
  });

  it('reads nothing and sends nothing when the channel is off', async () => {
    isBusinessEventsChannelConfigured.mockReturnValue(false);

    await notifyCompanyRegistered('company-1');
    await notifyInviteAccepted({ companyId: 'company-1', companyName: 'Acme Corp', roleName: 'company_member' });
    await notifyUserDeleted({ deletedUser: { role: 'user', company_id: 'company-1' } }, 'self');

    expect(getCompanyByIdInDb).not.toHaveBeenCalled();
    expect(countUsersInDb).not.toHaveBeenCalled();
    expect(sendBusinessEventToTelegram).not.toHaveBeenCalled();
  });

  it('company.registered carries the company name and trial end', async () => {
    getSubscriptionDataInDb.mockResolvedValue({ expires_at: TRIAL_END });

    await notifyCompanyRegistered('company-1');

    expect(sendBusinessEventToTelegram).toHaveBeenCalledWith('company.registered', { companyName: 'Acme Corp', trialEndsAt: TRIAL_END });
  });

  it('team.invite.accepted carries the new member count', async () => {
    countUsersInDb.mockResolvedValue(4);

    await notifyInviteAccepted({ companyId: 'company-1', companyName: 'Acme Corp', roleName: 'company_member' });

    expect(countUsersInDb).toHaveBeenCalledWith({ company_id: 'company-1' });
    expect(sendBusinessEventToTelegram).toHaveBeenCalledWith('team.invite.accepted', {
      companyName: 'Acme Corp',
      roleName: 'company_member',
      memberCount: 4,
    });
  });

  it('subscription transitions get the company name added', async () => {
    await notifySubscriptionTransition('company-1', { event: 'subscription.ended', fields: { plan: null, status: 'canceled' } });

    expect(sendBusinessEventToTelegram).toHaveBeenCalledWith('subscription.ended', { plan: null, status: 'canceled', companyName: 'Acme Corp' });
  });

  it('a last-member deletion sends account.deleted then company.deleted, from the transaction data', async () => {
    await notifyUserDeleted({
      status: 'deleted',
      deletedUser: { id: 'user-1', role: 'user', company_id: 'company-1' },
      companyDeleted: true,
      companyName: 'Acme Corp',
      subscription: { stripe_subscription_id: 'sub_1', expires_at: FUTURE },
    }, 'self');

    expect(getCompanyByIdInDb).not.toHaveBeenCalled();
    expect(sendBusinessEventToTelegram.mock.calls).toEqual([
      ['account.deleted', { actorKind: 'self', companyName: 'Acme Corp', remainingMemberCount: 0 }],
      ['company.deleted', { actorKind: 'self', companyName: 'Acme Corp', hadPaidSubscription: true }],
    ]);
  });

  it('a trial company deletion reports no paid subscription', async () => {
    await notifyUserDeleted({
      deletedUser: { role: 'user', company_id: 'company-1' },
      companyDeleted: true,
      companyName: 'Acme Corp',
      subscription: { stripe_subscription_id: null, expires_at: FUTURE },
    }, 'admin');

    expect(sendBusinessEventToTelegram).toHaveBeenLastCalledWith('company.deleted', expect.objectContaining({ hadPaidSubscription: false }));
  });

  it('a member removal reads the remaining company name and count', async () => {
    await notifyUserDeleted({
      deletedUser: { role: 'user', company_id: 'company-1' },
      companyDeleted: false,
      remainingMemberCount: 2,
    }, 'team');

    expect(sendBusinessEventToTelegram).toHaveBeenCalledTimes(1);
    expect(sendBusinessEventToTelegram).toHaveBeenCalledWith('account.deleted', { actorKind: 'team', companyName: 'Acme Corp', remainingMemberCount: 2 });
  });

  it('a superadmin deletion is a bare platform-admin event', async () => {
    await notifyUserDeleted({ deletedUser: { role: 'superadmin', company_id: null }, companyDeleted: false }, 'self');

    expect(sendBusinessEventToTelegram).toHaveBeenCalledWith('account.deleted', { platformAdmin: true });
  });

  it('never throws - a failing read only warns', async () => {
    getSubscriptionDataInDb.mockRejectedValue(new Error('db down'));

    await expect(notifyCompanyRegistered('company-1')).resolves.toBeUndefined();

    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('company.registered'), expect.any(Error), { event: 'company.registered' });
    expect(logError).not.toHaveBeenCalled();
    expect(sendBusinessEventToTelegram).not.toHaveBeenCalled();
  });
});
