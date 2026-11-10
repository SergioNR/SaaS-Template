import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/healthModel.js', () => ({
  checkDatabaseConnectionInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logWarn: jest.fn(),
}));

const { getHealth } = await import('../server/controllers/healthController.js');
const { checkDatabaseConnectionInDb } = await import('../server/models/healthModel.js');
const { logWarn } = await import('../server/config/loggerFunctions.js');
const { markShuttingDown, resetProcessLifecycle } = await import('../server/utils/processLifecycle.js');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('getHealth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetProcessLifecycle();
  });

  it('returns 200 ok when the database answers', async () => {
    checkDatabaseConnectionInDb.mockResolvedValue(undefined);
    const res = createMockRes();

    await getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });

  it('returns 503 without throwing when the database is unreachable', async () => {
    checkDatabaseConnectionInDb.mockRejectedValue(new Error('ECONNREFUSED'));
    const res = createMockRes();

    await expect(getHealth({}, res)).resolves.toBeDefined();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
    expect(logWarn).toHaveBeenCalled();
  });

  it('returns 503 without touching the database once a graceful shutdown started', async () => {
    markShuttingDown();
    const res = createMockRes();

    await getHealth({}, res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'unavailable' });
    expect(checkDatabaseConnectionInDb).not.toHaveBeenCalled();
  });
});
