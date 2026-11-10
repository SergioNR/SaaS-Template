import { jest } from '@jest/globals';

const loggerMock = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
};

jest.unstable_mockModule('../server/config/logger.js', () => ({
  logger: loggerMock,
}));

jest.unstable_mockModule('../server/config/telegramBotConfig.js', () => ({
  sendTelegramMessage: jest.fn().mockResolvedValue(true),
}));

const {
  logError, logInfo, logWarn, logAudit, serializeError,
} = await import('../server/config/loggerFunctions.js');
const {
  ALERT_DEDUPE_WINDOW_MS,
  escapeHtml,
  resetAlertDedupe,
  shouldSendAlert,
} = await import('../server/integrations/telegram/sendLogsToTelegram.js');
const { sendTelegramMessage } = await import('../server/config/telegramBotConfig.js');

describe('serializeError', () => {
  it('keeps only name, message, code, status and stack', () => {
    const error = Object.assign(new Error('bad json'), {
      status: 400,
      code: 'E_PARSE',
      body: '{"password":"hunter2"}',
      headers: { cookie: 'app.sid=secret' },
    });

    const serialized = serializeError(error);

    expect(Object.keys(serialized).sort()).toEqual(['code', 'message', 'name', 'stack', 'status']);
    expect(JSON.stringify(serialized)).not.toContain('hunter2');
    expect(JSON.stringify(serialized)).not.toContain('secret');
  });

  it('handles missing and non-object errors', () => {
    expect(serializeError(undefined)).toEqual({ name: 'UnknownError', message: 'no error provided' });
    expect(serializeError('plain string')).toEqual({ name: 'NonErrorThrown', message: 'plain string' });
  });
});

describe('log functions', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('logError never logs the raw error object', () => {
    const error = Object.assign(new Error('boom'), { body: 'secret-body' });

    logError('Something failed', error);

    const [payload] = loggerMock.error.mock.calls[0];
    expect(payload.context.errorDetails).not.toBe(error);
    expect(JSON.stringify(payload)).not.toContain('secret-body');
  });

  it('logWarn tolerates a missing error', async () => {
    await expect(logWarn('Just a warning')).resolves.toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('only logError reaches Telegram - info and warn stay in pino', async () => {
    await logInfo('routine event');
    await logWarn('something odd', new Error('odd'));
    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledTimes(1);
    expect(sendTelegramMessage).not.toHaveBeenCalled();

    logError('real failure', new Error('boom'));
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
  });

  it('escapes HTML in the Telegram error message', () => {
    logError('<script>alert(1)</script>', new Error('a < b & "c"'));

    const [, message] = sendTelegramMessage.mock.calls[0];
    expect(message).not.toContain('<script>');
    expect(message).toContain('&lt;script&gt;');
    expect(message).toContain('a &lt; b &amp; &quot;c&quot;');
  });
});

describe('Telegram request id', () => {
  beforeEach(() => {
    resetAlertDedupe();
    jest.clearAllMocks();
  });

  it('puts the request id of the failing request into the alert', () => {
    logError('request failed', new Error('boom'), { requestId: '00000000-0000-4000-8000-0000000000f1', method: 'GET' });

    const [, message] = sendTelegramMessage.mock.calls[0];
    expect(message).toContain('<b>Request Id</b>: 00000000-0000-4000-8000-0000000000f1');
  });

  it('falls back to N/A outside a request', () => {
    logError('cron failed', new Error('boom'));

    const [, message] = sendTelegramMessage.mock.calls[0];
    expect(message).toContain('<b>Request Id</b>: N/A');
  });
});

describe('Telegram alert dedupe', () => {
  beforeEach(() => {
    resetAlertDedupe();
    jest.clearAllMocks();
  });

  it('sends the same alert at most once per window', () => {
    logError('database unreachable', new Error('ECONNREFUSED'));
    logError('database unreachable', new Error('ECONNREFUSED'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    //* Every occurrence is still logged
    expect(loggerMock.error).toHaveBeenCalledTimes(2);
  });

  it('lets different alerts through', () => {
    logError('database unreachable', new Error('ECONNREFUSED'));
    logError('stripe unreachable', new Error('ETIMEDOUT'));

    expect(sendTelegramMessage).toHaveBeenCalledTimes(2);
  });

  it('sends the alert again once the window passed', () => {
    const start = 1_000_000;

    expect(shouldSendAlert('k', start)).toBe(true);
    expect(shouldSendAlert('k', start + ALERT_DEDUPE_WINDOW_MS - 1)).toBe(false);
    expect(shouldSendAlert('k', start + ALERT_DEDUPE_WINDOW_MS)).toBe(true);
  });
});

describe('escapeHtml', () => {
  it('escapes HTML special characters and stringifies objects', () => {
    expect(escapeHtml('<b>&</b>')).toBe('&lt;b&gt;&amp;&lt;/b&gt;');
    expect(escapeHtml({ a: '<x>' })).toBe('{&quot;a&quot;:&quot;&lt;x&gt;&quot;}');
  });

  it('truncates very long values', () => {
    expect(escapeHtml('x'.repeat(5000)).length).toBeLessThan(1100);
  });
});

describe('logAudit', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  const auditReq = () => ({
    id: '00000000-0000-4000-8000-0000000000f1',
    user: { id: '00000000-0000-4000-8000-000000000001', company_id: '00000000-0000-4000-8000-0000000000c0' },
  });

  it('emits an info line with the action as message and mirrored request context', () => {
    logAudit(auditReq(), 'team.member.role_updated', {
      entity: 'user',
      entityId: '00000000-0000-4000-8000-0000000000aa',
      changedFields: ['role'],
    });

    expect(loggerMock.info).toHaveBeenCalledTimes(1);
    expect(loggerMock.info).toHaveBeenCalledWith({
      message: 'team.member.role_updated',
      audit: {
        entity: 'user',
        entityId: '00000000-0000-4000-8000-0000000000aa',
        changedFields: ['role'],
      },
      userId: '00000000-0000-4000-8000-000000000001',
      companyId: '00000000-0000-4000-8000-0000000000c0',
      reqId: '00000000-0000-4000-8000-0000000000f1',
    });
  });

  it('omits the changed-fields list for creates and deletes', () => {
    logAudit(auditReq(), 'file.deleted', { entity: 'file', entityId: '00000000-0000-4000-8000-0000000000ab' });

    const [payload] = loggerMock.info.mock.calls[0];
    expect(payload.audit).toEqual({
      entity: 'file',
      entityId: '00000000-0000-4000-8000-0000000000ab',
    });
    expect('changedFields' in payload.audit).toBe(false);
  });

  it('stays null-safe and silent for a request without a session', () => {
    expect(() => logAudit({}, 'auth.register.requested', { entity: 'user' })).not.toThrow();

    const [payload] = loggerMock.info.mock.calls[0];
    expect(payload.userId).toBeNull();
    expect(payload.companyId).toBeNull();
    expect(payload.reqId).toBeNull();
    expect(payload.audit.entityId).toBeNull();
  });

  it('never reaches Telegram', () => {
    logAudit(auditReq(), 'team.invite.created', { entity: 'invite', entityId: '00000000-0000-4000-8000-0000000000ac' });

    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});
