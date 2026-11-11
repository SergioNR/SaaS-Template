import { jest } from '@jest/globals';

const sendTransacEmail = jest.fn();

//* The real brevo.js runs (env-driven config + the link builder); only the
//* SDK client is replaced. Env is set before the dynamic imports below
Object.assign(process.env, {
  BREVO_API_KEY: 'test-brevo-key',
  BREVO_SENDER_EMAIL: 'support@acme.test',
  BREVO_RESET_PASSWORD_TEMPLATE_ID: '2',
  BREVO_TEAM_INVITE_TEMPLATE_ID: '3',
  BREVO_VERIFY_EMAIL_TEMPLATE_ID: '4',
  FRONT_WEB_APP_ORIGIN_URL: 'https://app.example.com/',
});

jest.unstable_mockModule('@getbrevo/brevo', () => ({
  BrevoClient: class {
    constructor() {
      this.transactionalEmails = { sendTransacEmail };
    }
  },
}));

const logError = jest.fn();
const logInfo = jest.fn();

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError,
  logInfo,
  logWarn: jest.fn(),
}));

const { frontendUrl } = await import('../server/integrations/brevo/transactionalEmails/brevo.js');
const { sendResetPasswordTokenToUser } = await import('../server/integrations/brevo/transactionalEmails/sendResetPasswordTokenToUser.js');
const { sendTeamInviteToUser } = await import('../server/integrations/brevo/transactionalEmails/sendTeamInviteToUser.js');
const { sendEmailVerificationToUser } = await import('../server/integrations/brevo/transactionalEmails/sendEmailVerificationToUser.js');
const { sendExistingAccountNoticeToUser } = await import('../server/integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js');

describe('frontendUrl', () => {
  it('drops a trailing slash of the configured origin', () => {
    expect(frontendUrl('/auth/restore-password', { passwordResetToken: 'abc' }, 'https://app.example.com/'))
      .toBe('https://app.example.com/auth/restore-password?passwordResetToken=abc');
  });

  it('keeps only the origin when the configured URL carries a path', () => {
    expect(frontendUrl('/auth/accept-invite', { inviteToken: 'abc' }, 'https://app.example.com:8443/some/base/'))
      .toBe('https://app.example.com:8443/auth/accept-invite?inviteToken=abc');
  });

  it('keeps base64url tokens intact and encodes anything unsafe', () => {
    expect(frontendUrl('/auth/restore-password', { passwordResetToken: 'a-b_c' }, 'https://app.example.com'))
      .toBe('https://app.example.com/auth/restore-password?passwordResetToken=a-b_c');
    expect(frontendUrl('/x', { token: 'a&b=c d' }, 'https://app.example.com'))
      .toBe('https://app.example.com/x?token=a%26b%3Dc+d');
  });

  it('defaults to FRONT_WEB_APP_ORIGIN_URL', () => {
    expect(frontendUrl('/auth/login')).toBe('https://app.example.com/auth/login');
  });
});

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
    expect(payload.params).toMatchObject({
      appOrigin: 'https://app.example.com/',
      passwordResetToken: 'raw-reset-token',
      resetPasswordUrl: 'https://app.example.com/auth/restore-password?passwordResetToken=raw-reset-token',
    });
    expect(logError).not.toHaveBeenCalled();
  });

  it('sendTeamInviteToUser pins recipient, template and invite params', async () => {
    sendTransacEmail.mockResolvedValue({ messageId: 'ok' });

    await sendTeamInviteToUser('new@acme.test', 'raw-invite-token', 'Acme Corp', 'owner@acme.test');

    const [payload] = sendTransacEmail.mock.calls[0];
    expect(payload.to).toEqual([{ email: 'new@acme.test' }]);
    expect(payload.templateId).toBe(3);
    expect(payload.params).toMatchObject({
      acceptInviteUrl: 'https://app.example.com/auth/accept-invite?inviteToken=raw-invite-token',
      inviteToken: 'raw-invite-token',
      companyName: 'Acme Corp',
      inviterEmail: 'owner@acme.test',
    });
  });

  it('sendEmailVerificationToUser links the SPA verification page and never passes the raw token on its own', async () => {
    sendTransacEmail.mockResolvedValue({ messageId: 'ok' });

    await sendEmailVerificationToUser('new@acme.test', 'raw-verify-token');

    const [payload] = sendTransacEmail.mock.calls[0];
    expect(payload.to).toEqual([{ email: 'new@acme.test' }]);
    expect(payload.templateId).toBe(4);
    expect(payload.params).toEqual({
      appOrigin: 'https://app.example.com/',
      emailVerificationUrl: 'https://app.example.com/auth/verify-email?emailVerificationToken=raw-verify-token',
    });
  });

  it.each([
    ['email verification', () => sendEmailVerificationToUser('new@acme.test', 'raw-verify-token')],
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
