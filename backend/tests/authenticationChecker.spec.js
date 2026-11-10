import { jest } from '@jest/globals';
import { checkAuthentication } from '../server/middlewares/authenticationChecker.js';

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('checkAuthentication', () => {
  it('is a factory returning the middleware', () => {
    expect(typeof checkAuthentication()).toBe('function');
  });

  it('lets an authenticated session through', () => {
    const next = jest.fn();
    const res = createMockRes();

    checkAuthentication()({ isAuthenticated: () => true }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('answers 401 with an empty body and stops the chain otherwise', () => {
    const next = jest.fn();
    const res = createMockRes();

    checkAuthentication()({ isAuthenticated: () => false }, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({});
    expect(next).not.toHaveBeenCalled();
  });
});
