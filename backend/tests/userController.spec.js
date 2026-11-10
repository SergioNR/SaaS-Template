import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserById: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  deleteUserAndCleanup: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logAudit: jest.fn(),
}));

const { deleteUser } = await import('../server/controllers/userController.js');
const { deleteUserAndCleanup } = await import('../server/utils/userDeletionCleanup.js');
const { logAudit } = await import('../server/config/loggerFunctions.js');

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    clearCookie: jest.fn(),
  };
  return res;
};

const mockReq = () => ({
  user: { id: 'user-1', company_id: 'company-1' },
  session: { destroy: jest.fn((callback) => callback()) },
});

describe('deleteUser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deletes with the last-owner guard and destroys the session', async () => {
    deleteUserAndCleanup.mockResolvedValue({ status: 'deleted', deletedUser: { id: 'user-1' } });
    const req = mockReq();
    const res = mockRes();

    await deleteUser(req, res);

    expect(deleteUserAndCleanup).toHaveBeenCalledWith('user-1', { protectLastOwner: true });
    expect(req.session.destroy).toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(logAudit).toHaveBeenCalledWith(req, 'user.deleted', { entity: 'user', entityId: 'user-1' });
    expect(logAudit).toHaveBeenCalledTimes(1);
  });

  it('also audits the company removal when the caller was its last member', async () => {
    deleteUserAndCleanup.mockResolvedValue({
      status: 'deleted',
      deletedUser: { id: 'user-1' },
      companyDeleted: true,
      companyId: 'company-1',
    });
    const req = mockReq();

    await deleteUser(req, mockRes());

    expect(logAudit).toHaveBeenCalledWith(req, 'company.deleted', { entity: 'company', entityId: 'company-1' });
  });

  it('returns 409 with a stable code when the caller is the last owner while members remain', async () => {
    deleteUserAndCleanup.mockResolvedValue({ status: 'last_owner' });
    const req = mockReq();
    const res = mockRes();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_LAST_COMPANY_OWNER' }));
    expect(req.session.destroy).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses to delete the last superadmin with 409 LAST_SUPERADMIN', async () => {
    deleteUserAndCleanup.mockResolvedValue({ status: 'last_superadmin' });
    const req = mockReq();
    const res = mockRes();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'LAST_SUPERADMIN' }));
    expect(req.session.destroy).not.toHaveBeenCalled();
  });

  it('maps an FK violation of the deletion transaction to 409', async () => {
    deleteUserAndCleanup.mockRejectedValue(Object.assign(new Error('fk'), { code: 'P2003' }));
    const req = mockReq();
    const res = mockRes();

    await deleteUser(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(req.session.destroy).not.toHaveBeenCalled();
  });

  it('returns 404 when the user no longer exists', async () => {
    deleteUserAndCleanup.mockResolvedValue({ status: 'not_found' });
    const res = mockRes();

    await deleteUser(mockReq(), res);

    expect(res.status).toHaveBeenCalledWith(404);
  });
});
