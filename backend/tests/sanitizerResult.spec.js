import { jest } from '@jest/globals';

const validationResultMock = jest.fn();

jest.unstable_mockModule('express-validator', () => ({
  validationResult: validationResultMock,
}));

const { sanitizerResult } = await import('../server/middlewares/sanitizerResult.js');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('sanitizerResult', () => {
  beforeEach(() => {
    validationResultMock.mockReset();
  });

  it('passes through to the controller when validation succeeds', () => {
    validationResultMock.mockReturnValue({ isEmpty: () => true, errors: [] });

    const next = jest.fn();
    const res = createMockRes();

    sanitizerResult({ body: {} }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects with 422 and the sanitized error list when validation fails', () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      errors: [{
        type: 'field', path: 'password', value: 'hunter2', msg: 'too short',
      }],
    });

    const next = jest.fn();
    const res = createMockRes();

    sanitizerResult({ body: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      errors: [{
        type: 'field', path: 'password', value: '[REDACTED]', msg: 'too short',
      }],
    });
  });

  it.each([
    'password',
    'confirmNewPassword',
    'passwordResetToken',
    'email',
    'username',
    'newPassword',
    'currentPassword',
    'inviteToken',
  ])('redacts the value of the sensitive field %s', (path) => {
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      errors: [{
        type: 'field', path, value: 'secret-value', msg: 'invalid',
      }],
    });

    const res = createMockRes();

    sanitizerResult({ body: {} }, res, jest.fn());

    const [payload] = res.json.mock.calls[0];
    expect(payload.errors[0].value).toBe('[REDACTED]');
  });

  it('keeps values of non-sensitive fields intact', () => {
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      errors: [{
        type: 'field', path: 'companyName', value: 'Acme Corp', msg: 'too long',
      }],
    });

    const res = createMockRes();

    sanitizerResult({ body: {} }, res, jest.fn());

    const [payload] = res.json.mock.calls[0];
    expect(payload.errors[0].value).toBe('Acme Corp');
  });

  it('never mutates the original error objects (they are shared with express-validator)', () => {
    const original = {
      type: 'field', path: 'password', value: 'hunter2', msg: 'too short',
    };
    validationResultMock.mockReturnValue({
      isEmpty: () => false,
      errors: [original],
    });

    sanitizerResult({ body: {} }, createMockRes(), jest.fn());

    expect(original.value).toBe('hunter2');
  });
});
