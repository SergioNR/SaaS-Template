import { jest } from '@jest/globals';
import {
  WRITE_ERROR_RESPONSES,
  isPrismaErrorCode,
  isTransientDatabaseError,
  sendMappedWriteError,
} from '../server/utils/prismaErrors.js';

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const prismaError = (code) => Object.assign(new Error(code), { code });

describe('sendMappedWriteError', () => {
  it.each([
    ['P2002', 409],
    ['P2003', 409],
    ['P2025', 404],
  ])('answers %s with %s and the default message', (code, status) => {
    const res = mockRes();

    expect(sendMappedWriteError(res, prismaError(code))).toBe(true);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({ message: WRITE_ERROR_RESPONSES[code].message });
  });

  it('leaves unmapped and non-Prisma errors to the caller', () => {
    const res = mockRes();

    expect(sendMappedWriteError(res, prismaError('P1001'))).toBe(false);
    expect(sendMappedWriteError(res, new Error('boom'))).toBe(false);
    expect(sendMappedWriteError(res, undefined)).toBe(false);
    expect(sendMappedWriteError(res, prismaError('toString'))).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('uses an endpoint-specific body, stable code included, when overridden', () => {
    const res = mockRes();

    sendMappedWriteError(res, prismaError('P2002'), {
      P2002: { status: 409, message: 'Already pending', code: 'INVITE_PENDING' },
    });

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ message: 'Already pending', code: 'INVITE_PENDING' });
  });

  it('lets an override switch a code off', () => {
    const res = mockRes();

    expect(sendMappedWriteError(res, prismaError('P2025'), { P2025: null })).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('isPrismaErrorCode', () => {
  it('matches the error code only', () => {
    expect(isPrismaErrorCode(prismaError('P2002'), 'P2002')).toBe(true);
    expect(isPrismaErrorCode(prismaError('P2003'), 'P2002')).toBe(false);
    expect(isPrismaErrorCode(null, 'P2002')).toBe(false);
  });
});

describe('isTransientDatabaseError', () => {
  it.each(['P1001', 'P1017', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'])('%s on the error is transient', (code) => {
    expect(isTransientDatabaseError(prismaError(code))).toBe(true);
  });

  it.each(['P1001', 'ECONNREFUSED'])('%s on the error cause is transient', (code) => {
    expect(isTransientDatabaseError(Object.assign(new Error('wrapped'), { cause: { code } }))).toBe(true);
  });

  it.each([
    ['a unique-constraint error', prismaError('P2002')],
    ['an error without code', new Error('boom')],
    ['null', null],
    ['undefined', undefined],
  ])('%s is not transient', (_label, error) => {
    expect(isTransientDatabaseError(error)).toBe(false);
  });
});
