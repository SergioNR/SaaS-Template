import { describe, expect, it } from '@jest/globals';
import { Writable } from 'node:stream';
import pino from 'pino';

const { redactOptions } = await import('../server/config/logger.js');

//* A pino instance with the production redact config writing to memory
const captureLog = (entry) => {
  const lines = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });

  pino({ redact: redactOptions }, stream).info(entry);

  return JSON.parse(lines[0]);
};

describe('logger redaction', () => {
  it.each([
    'email',
    'password',
    'username',
    'currentPassword',
    'newPassword',
    'confirmNewPassword',
    'inviteToken',
    'passwordResetToken',
  ])('redacts context.%s and context.additionalInfo.%s', (field) => {
    const logged = captureLog({
      message: 'x',
      context: {
        [field]: 'secret-value',
        additionalInfo: { [field]: 'secret-value' },
      },
    });

    expect(logged.context[field]).toBe('[REDACTED]');
    expect(logged.context.additionalInfo[field]).toBe('[REDACTED]');
  });

  it('redacts cookies and authorization headers of logged requests', () => {
    const logged = captureLog({
      req: { headers: { cookie: 'app.sid=secret', authorization: 'Bearer secret', 'user-agent': 'jest' } },
      context: { req: { headers: { cookie: 'app.sid=secret', authorization: 'Bearer secret' } } },
    });

    expect(logged.req.headers.cookie).toBe('[REDACTED]');
    expect(logged.req.headers.authorization).toBe('[REDACTED]');
    expect(logged.req.headers['user-agent']).toBe('jest');
    expect(logged.context.req.headers.cookie).toBe('[REDACTED]');
    expect(logged.context.req.headers.authorization).toBe('[REDACTED]');
  });

  it('keeps raw request bodies out of the logs', () => {
    const logged = captureLog({ context: { errorDetails: { body: '{"password":"hunter2"}' } } });

    expect(JSON.stringify(logged)).not.toContain('hunter2');
  });
});
