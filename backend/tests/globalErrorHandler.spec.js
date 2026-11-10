import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

const { globalErrorHandler } = await import('../server/middlewares/globalErrorHandler.js');
const { logError, logWarn } = await import('../server/config/loggerFunctions.js');

const createMockRes = () => {
  const res = { headersSent: false };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createMockReq = () => ({
  method: 'POST',
  path: '/api/v1/auth/login',
  id: '00000000-0000-4000-8000-0000000000f1',
  user: { id: '00000000-0000-4000-8000-000000000001' },
});

const expectedRequestContext = (req) => ({
  requestId: req.id,
  method: req.method,
  path: req.path,
  userId: req.user.id,
});

describe('globalErrorHandler', () => {
  const originalDeployEnvironment = process.env.DEPLOY_ENVIRONMENT;

  afterEach(() => {
    process.env.DEPLOY_ENVIRONMENT = originalDeployEnvironment;
    jest.clearAllMocks();
  });

  it('respects err.statusCode when present', () => {
    process.env.DEPLOY_ENVIRONMENT = 'localhost';
    const res = createMockRes();
    const error = Object.assign(new Error(' Gone'), { statusCode: 410 });

    globalErrorHandler(error, createMockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(410);
  });

  it('falls back to 500 for errors without a status', () => {
    process.env.DEPLOY_ENVIRONMENT = 'localhost';
    const res = createMockRes();

    globalErrorHandler(new Error('boom'), createMockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('falls back to 500 for out-of-range status values', () => {
    const res = createMockRes();

    globalErrorHandler(Object.assign(new Error('weird'), { status: 200 }), createMockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('keeps body-parser errors as 400 instead of 500', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    const res = createMockRes();
    const error = Object.assign(new SyntaxError('Unexpected token } in JSON'), {
      status: 400,
      type: 'entity.parse.failed',
      body: '{"password":"hunter2"}',
    });

    globalErrorHandler(error, createMockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Bad Request',
      message: 'The request could not be processed',
    });
  });

  it('hides error details outside localhost', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    const res = createMockRes();

    globalErrorHandler(new Error('sensitive stack detail'), createMockReq(), res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      name: 'Internal Server Error',
      message: 'An error occurred, please try again later',
    });
  });

  it('returns error details on localhost', () => {
    process.env.DEPLOY_ENVIRONMENT = 'localhost';
    const res = createMockRes();

    globalErrorHandler(new TypeError('debug detail'), createMockReq(), res, jest.fn());

    expect(res.json).toHaveBeenCalledWith({
      name: 'TypeError',
      message: 'debug detail',
    });
  });

  it('logs server errors with logError and the request context', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    const res = createMockRes();
    const req = createMockReq();
    const error = new Error('boom');

    globalErrorHandler(error, req, res, jest.fn());

    expect(logError).toHaveBeenCalledWith('Error', error, expectedRequestContext(req));
    expect(logWarn).not.toHaveBeenCalled();
  });

  it('logs client errors as warnings only (no Telegram alert), with the request context', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    const res = createMockRes();
    const req = createMockReq();
    const error = Object.assign(new Error('too large'), { status: 413 });

    globalErrorHandler(error, req, res, jest.fn());

    expect(logWarn).toHaveBeenCalledWith(
      'Client error 413 on POST /api/v1/auth/login',
      error,
      expectedRequestContext(req),
    );
    expect(logError).not.toHaveBeenCalled();
  });

  it('stays null-safe on request context for a bare req', () => {
    process.env.DEPLOY_ENVIRONMENT = 'production';
    const res = createMockRes();

    globalErrorHandler(new Error('boom'), { method: 'GET', path: '/x' }, res, jest.fn());

    expect(logError).toHaveBeenCalledWith('Error', expect.any(Error), {
      requestId: null,
      method: 'GET',
      path: '/x',
      userId: null,
    });
  });

  it('delegates to Express when headers were already sent', () => {
    const res = createMockRes();
    res.headersSent = true;
    const next = jest.fn();
    const error = new Error('mid-stream');

    globalErrorHandler(error, createMockReq(), res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
    expect(logError).not.toHaveBeenCalled();
  });
});
