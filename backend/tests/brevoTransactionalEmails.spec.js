import { jest } from '@jest/globals';

const sendTransacEmail = jest.fn();

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/brevo.js', () => ({
  brevoClient: { transactionalEmails: { sendTransacEmail } },
  companyEmails: { support: 'support@acme.test', hello: 'hello@acme.test' },
  templateIds: { resetPassword: 2, teamInvite: 3 },
  commonTemplateParams: () => ({ appOrigin: 'https://app.example.com' }),
}));

const logError = jest.fn();
const logInfo = jest.fn();

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError,
  logInfo,
  logWarn: jest.fn(),
}));

const { sendResetPasswordTokenToUser } = await import('../server/integrations/brevo/transactionalEmails/sendResetPasswordTokenToUser.js');
const { sendTeamInviteToUser } = await import('../server/integrations/brevo/transactionalEmails/sendTeamInviteToUser.js');
const { sendExistingAccountNoticeToUser } = await import('../server/integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js');

describe('brevo transactional emails', () => {
  const originalTemplateId = process.env.BREVO_ACCOUNT_EXISTS_TEMPLATE_ID;

  beforeEach(() => {
    sendTransacEmail.mockReset();
    logError.mockClear();
    logInfo.mockClear();
  });

  afterEach(() => {
    process.env.BREVO_ACCOUNT_EXISTS_TEMPLATE_ID = originalTemplateId;
    if (originalTemplateId === undefined) delete process.env.BREVO_ACCOUNT_EXISTS_TEMPLATE_ID;
  });

  it('sendResetPasswordTokenToUser pins recipient, template and token params', async () => {
    sendTransacEmail.mockResolvedValue({ messageId: 'ok' });

    await sendResetPasswordTokenToUser('owner@acme.test', 'raw-reset-token');

    const [payload] = sendTransacEmail.mock.calls[0];
    expect(payload.sender.email).toBe('support@acme.test');
    expect(payload.to).toEqual([{ email: 'owner@acme.test' }]);
    expect(payload.templateId).toBe(2);
    expect(payload.params).toMatchObject({ appOrigin: 'https://app.example.com', passwordResetToken: 'raw-reset-token' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('sendTeamInviteToUser pins recipient, template and invite params', async () => {
    sendTransacEmail.mockResolvedValue({ messageId: 'ok' });

    await sendTeamInviteToUser('new@acme.test', 'raw-invite-token', 'Acme Corp', 'owner@acme.test');

    const [payload] = sendTransacEmail.mock.calls[0];
    expect(payload.to).toEqual([{ email: 'new@acme.test' }]);
    expect(payload.templateId).toBe(3);
    expect(payload.params).toMatchObject({
      inviteToken: 'raw-invite-token',
      companyName: 'Acme Corp',
      inviterEmail: 'owner@acme.test',
    });
  });

  it.each([
    ['reset token', () => sendResetPasswordTokenToUser('owner@acme.test', 'raw-reset-token')],
    ['team invite', () => sendTeamInviteToUser('new@acme.test', 'raw-invite-token', 'Acme Corp', 'owner@acme.test')],
  ])('%s send resolves instead of rejecting when Brevo fails (fire-and-forget invariant)', async (_name, send) => {
    const brevoError = new Error('brevo down');

    sendTransacEmail.mockRejectedValue(brevoError);

    await expect(send()).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('error sending'), brevoError);
  });

  it('sendExistingAccountNoticeToUser is a no-op without the optional template id', async () => {
    delete process.env.BREVO_ACCOUNT_EXISTS_TEMPLATE_ID;

    await sendExistingAccountNoticeToUser('owner@acme.test');

    expect(sendTransacEmail).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('sendExistingAccountNoticeToUser resolves instead of rejecting when Brevo fails', async () => {
    process.env.BREVO_ACCOUNT_EXISTS_TEMPLATE_ID = '9';
    const brevoError = new Error('brevo down');

    sendTransacEmail.mockRejectedValue(brevoError);

    await expect(sendExistingAccountNoticeToUser('owner@acme.test')).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith('error sending sendExistingAccountNoticeToUser', brevoError);
  });
});
