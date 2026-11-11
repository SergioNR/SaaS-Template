import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
  logInfo: jest.fn(),
}));

const {
  BUSINESS_EVENTS,
  buildBusinessEventMessage,
  sendBusinessEventToTelegram,
} = await import('../server/integrations/telegram/sendBusinessEventsToTelegram.js');
const { logError, logWarn } = await import('../server/config/loggerFunctions.js');

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

//* Realistic inputs for every event, including fields a careless caller might
//* add - only the template's own fields may reach the message
const SAMPLE_FIELDS = {
  'company.registered': { companyName: 'Acme Corp', trialEndsAt: new Date('2030-01-08T00:00:00Z') },
  'subscription.started': {
    companyName: 'Acme Corp', startKind: 'converted', plan: { planName: 'pro', planBillingCycle: 'monthly' }, periodEndsAt: new Date('2030-02-01T00:00:00Z'),
  },
  'subscription.cancellation_scheduled': { companyName: 'Acme Corp', plan: null, accessEndsAt: new Date('2030-02-01T00:00:00Z') },
  'subscription.ended': { companyName: 'Acme Corp', plan: { planName: 'basic', planBillingCycle: 'yearly' }, status: 'canceled' },
  'team.invite.accepted': { companyName: 'Acme Corp', roleName: 'company_member', memberCount: 4 },
  'account.deleted': { actorKind: 'team', companyName: 'Acme Corp', remainingMemberCount: 3 },
  'company.deleted': { actorKind: 'self', companyName: 'Acme Corp', hadPaidSubscription: true },
};

const PII_EXTRAS = {
  email: 'owner@acme.test',
  userId: '00000000-0000-4000-8000-000000000001',
  companyId: '00000000-0000-4000-8000-0000000000c0',
  stripeSubscriptionId: 'sub_123',
};

describe('buildBusinessEventMessage', () => {
  it('has a template for every catalogue event', () => {
    expect([...BUSINESS_EVENTS].sort()).toEqual(Object.keys(SAMPLE_FIELDS).sort());
  });

  it.each(Object.entries(SAMPLE_FIELDS))('%s never carries emails, ids or Stripe ids', (event, fields) => {
    const message = buildBusinessEventMessage(event, { ...fields, ...PII_EXTRAS });

    expect(message).toBeTruthy();
    expect(message).not.toMatch(EMAIL_PATTERN);
    expect(message).not.toMatch(UUID_PATTERN);
    expect(message).not.toContain('sub_123');
  });

  it('escapes markup in a company name', () => {
    const message = buildBusinessEventMessage('company.registered', { companyName: '<b>Acme</b>' });

    expect(message).toContain('&lt;b&gt;Acme&lt;/b&gt;');
    expect(message).not.toContain('<b>Acme</b>');
  });

  it('drops empty lines and names unnamed companies', () => {
    const message = buildBusinessEventMessage('company.registered', {});

    expect(message).toContain('unnamed');
    expect(message).not.toContain('Trial ends');
  });

  it('shows plan, kind and dates for a converted trial', () => {
    const message = buildBusinessEventMessage('subscription.started', SAMPLE_FIELDS['subscription.started']);

    expect(message).toContain('pro (monthly)');
    expect(message).toContain('converted from trial');
    expect(message).toContain('2030-02-01');
  });

  it('a platform admin deletion carries no other field', () => {
    expect(buildBusinessEventMessage('account.deleted', { platformAdmin: true, companyName: 'x' }))
      .toBe('📈 <b>Platform admin account deleted</b>');
  });

  it('names automatic cleanups as the actor', () => {
    expect(buildBusinessEventMessage('company.deleted', { actorKind: 'system', companyName: 'Squat Co' }))
      .toContain('automatic cleanup (unverified account)');
  });

  it('returns null for an unknown event', () => {
    expect(buildBusinessEventMessage('user.logged_in', {})).toBeNull();
  });
});

describe('sendBusinessEventToTelegram', () => {
  const originalEnv = { ...process.env };
  let fetchMock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchMock;
    process.env.TELEGRAM_BOT_API_KEY = 'test-bot-key';
    process.env.TELEGRAM_ERRORS_CHAT_ID = 'errors-chat';
    process.env.TELEGRAM_EVENTS_CHAT_ID = 'events-chat';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('is a no-op without TELEGRAM_EVENTS_CHAT_ID - no network call', async () => {
    delete process.env.TELEGRAM_EVENTS_CHAT_ID;

    await expect(sendBusinessEventToTelegram('company.registered', { companyName: 'Acme' })).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is a no-op without the bot key', async () => {
    delete process.env.TELEGRAM_BOT_API_KEY;

    await sendBusinessEventToTelegram('company.registered', { companyName: 'Acme' });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts one HTML message to the events chat, never the errors chat', async () => {
    await expect(sendBusinessEventToTelegram('company.registered', { companyName: 'Acme' })).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.chat_id).toBe('events-chat');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('Acme');
  });

  it('logs a warning, never an error, when the send fails', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(sendBusinessEventToTelegram('company.registered', { companyName: 'Acme' })).resolves.toBe(false);

    expect(logWarn).toHaveBeenCalledWith('Business event delivery failed', expect.any(Error), { event: 'company.registered' });
    expect(logError).not.toHaveBeenCalled();
  });

  it('logs a warning when Telegram answers non-OK', async () => {
    fetchMock.mockResolvedValue({ ok: false });

    await sendBusinessEventToTelegram('team.invite.accepted', SAMPLE_FIELDS['team.invite.accepted']);

    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(logError).not.toHaveBeenCalled();
  });

  it('never throws on an unknown event', async () => {
    await expect(sendBusinessEventToTelegram('bogus', {})).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});
