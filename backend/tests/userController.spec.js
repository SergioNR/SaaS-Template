import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserById: jest.fn(),
  getUserPassword: jest.fn(),
  updateUserPasswordInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  deleteUserAndCleanup: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logAudit: jest.fn(),
}));

const { deleteUser, updateUserPassword } = await import('../server/controllers/userController.js');
const { getUserPassword, updateUserPasswordInDb } = await import('../server/models/userModel.js');
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

    expect(deleteUserAndCleanup).toHaveBeenCalledWith('user-1', { protectLastOwner: true, actorKind: 'self' });
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

const currentHash = await bcrypt.hash('OldPassword1', 4);

describe('updateUserPassword', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getUserPassword.mockResolvedValue({ password: currentHash });
  });

  it('answers 400 with a stable code when the current password does not match', async () => {
    const res = mockRes();

    await updateUserPassword({ user: { id: 'user-1' }, sessionID: 'sid-1', body: { currentPassword: 'Wrong1234', newPassword: 'NewPassword1' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_CURRENT_PASSWORD_INCORRECT' }));
    expect(updateUserPasswordInDb).not.toHaveBeenCalled();
  });

  it('updates the hash and revokes tokens and other sessions in one model transaction, keeping the current session', async () => {
    updateUserPasswordInDb.mockResolvedValue({ id: 'user-1' });
    const res = mockRes();

    await updateUserPassword({ user: { id: 'user-1' }, sessionID: 'sid-1', body: { currentPassword: 'OldPassword1', newPassword: 'NewPassword1' } }, res);

    expect(updateUserPasswordInDb).toHaveBeenCalledWith('user-1', expect.stringMatching(/^\$2[aby]\$/), { keepSessionId: 'sid-1' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ userId: 'user-1' });
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), 'user.password.updated', { entity: 'user', entityId: 'user-1' });
    expect(JSON.stringify(logAudit.mock.calls.map((call) => call.slice(1)))).not.toContain('NewPassword1');
  });

  it('propagates transaction errors instead of swallowing them', async () => {
    updateUserPasswordInDb.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(updateUserPassword({ user: { id: 'user-1' }, sessionID: 'sid-1', body: { currentPassword: 'OldPassword1', newPassword: 'NewPassword1' } }, res)).rejects.toThrow('db down');
  });
});
