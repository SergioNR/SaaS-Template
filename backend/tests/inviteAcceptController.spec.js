import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserByEmail: jest.fn(),
  canCompanyMemberGrantRoleInDb: jest.fn(),
  createUserInDb: jest.fn(),
  getUserPassword: jest.fn(),
  updateUserPasswordInDb: jest.fn(),
  updateUserLastLoginDate: jest.fn(),
}));

jest.unstable_mockModule('../server/models/passwordResetTokensModel.js', () => ({
  createPasswordResetToken: jest.fn(),
  getPasswordResetTokenData: jest.fn(),
  resetUserPasswordWithTokenInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/teamInvitesModel.js', () => ({
  getTeamInviteByTokenInDb: jest.fn(),
  deleteTeamInviteByIdSafe: jest.fn().mockResolvedValue(undefined),
}));

jest.unstable_mockModule('../server/models/sessionModel.js', () => ({
  deleteUserSessions: jest.fn(),
  linkSessionToUser: jest.fn(),
}));

jest.unstable_mockModule('../server/models/posthogModel.js', () => ({
  posthogUserSuccessLoggedIn: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logAudit: jest.fn(),
  logError: jest.fn(),
}));

jest.unstable_mockModule('../server/auth/passportjs.js', () => ({
  default: { authenticate: jest.fn() },
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/sendResetPasswordTokenToUser.js', () => ({
  sendResetPasswordTokenToUser: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js', () => ({
  sendExistingAccountNoticeToUser: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/sendEmailVerificationToUser.js', () => ({
  sendEmailVerificationToUser: jest.fn(),
}));

jest.unstable_mockModule('../server/models/emailVerificationTokensModel.js', () => ({
  createEmailVerificationTokenInDb: jest.fn(),
  consumeEmailVerificationTokenInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  cleanupAfterUserDeletion: jest.fn().mockResolvedValue(undefined),
}));

//* Business events are covered by their own specs - stubbed here so the
//* real models behind them never load
jest.unstable_mockModule('../server/utils/businessEvents.js', () => ({
  notifyCompanyRegistered: jest.fn().mockResolvedValue(undefined),
  notifyInviteAccepted: jest.fn().mockResolvedValue(undefined),
  notifySubscriptionTransition: jest.fn().mockResolvedValue(undefined),
  notifyUserDeleted: jest.fn().mockResolvedValue(undefined),
}));

const { checkTeamInviteValidity, acceptTeamInvite } = await import('../server/controllers/authController.js');
const { getUserByEmail, canCompanyMemberGrantRoleInDb, createUserInDb } = await import('../server/models/userModel.js');
const { getTeamInviteByTokenInDb, deleteTeamInviteByIdSafe } = await import('../server/models/teamInvitesModel.js');
const { logAudit } = await import('../server/config/loggerFunctions.js');
const { cleanupAfterUserDeletion } = await import('../server/utils/userDeletionCleanup.js');
const { notifyInviteAccepted, notifyUserDeleted } = await import('../server/utils/businessEvents.js');

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

const validInvite = {
  id: 'invite-1',
  email: 'new@acme.test',
  company_id: 'company-1',
  role_id: 'role-member',
  invited_by: 'inviter-1',
  token_expires: new Date(Date.now() + 3600000),
  Company: { id: 'company-1', name: 'Acme Corp' },
  Role: { id: 'role-member', name: 'company_member' },
};

describe('checkTeamInviteValidity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canCompanyMemberGrantRoleInDb.mockResolvedValue(true);
  });

  it('returns 400 when the inviter is no longer a member of the company', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    canCompanyMemberGrantRoleInDb.mockResolvedValue(false);
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'invite-token' } }, res);

    expect(canCompanyMemberGrantRoleInDb).toHaveBeenCalledWith('inviter-1', 'company-1', 'company_member');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
  });

  it('returns 400 when the inviter can no longer grant the invited role', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue({ ...validInvite, Role: { id: 'role-admin', name: 'company_admin' } });
    canCompanyMemberGrantRoleInDb.mockResolvedValue(false);
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'invite-token' } }, res);

    expect(canCompanyMemberGrantRoleInDb).toHaveBeenCalledWith('inviter-1', 'company-1', 'company_admin');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
  });

  it('returns 404 when the token does not exist', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(null);
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 when the invite has expired', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue({ ...validInvite, token_expires: new Date(Date.now() - 1000) });
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'invite-token' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITE_EXPIRED' }));
  });

  it('looks the invite up by the raw token (the model hashes it)', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'raw-token' } }, res);

    expect(getTeamInviteByTokenInDb).toHaveBeenCalledWith('raw-token');
  });

  it('returns the invited email, company name and role for a valid invite', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    const res = mockRes();

    await checkTeamInviteValidity({ query: { inviteToken: 'invite-token' } }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@acme.test',
      companyName: 'Acme Corp',
      roleName: 'company_member',
    }));
  });
});

describe('acceptTeamInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canCompanyMemberGrantRoleInDb.mockResolvedValue(true);
  });

  it('returns 400 and voids the invite when the inviter left the company', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    canCompanyMemberGrantRoleInDb.mockResolvedValue(false);
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
    expect(deleteTeamInviteByIdSafe).toHaveBeenCalledWith('invite-1');
    expect(createUserInDb).not.toHaveBeenCalled();
  });

  it('returns 400 and voids the invite when the inviter was demoted below the invited role', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue({ ...validInvite, Role: { id: 'role-admin', name: 'company_admin' } });
    canCompanyMemberGrantRoleInDb.mockResolvedValue(false);
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
    expect(deleteTeamInviteByIdSafe).toHaveBeenCalledWith('invite-1');
    expect(createUserInDb).not.toHaveBeenCalled();
  });

  it('returns 400 when the conditional consumption inside the transaction finds no usable invite', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status: 'invite_invalid' });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/invalid or expired/),
      code: 'INVITE_EXPIRED',
    }));
  });

  it('returns 400 INVITER_INVALID when the in-transaction re-check finds the inviter removed or demoted', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status: 'inviter_invalid' });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
    //* The transaction already voided the invite
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
  });

  it('returns 404 when the token does not exist', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(null);
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'missing', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(createUserInDb).not.toHaveBeenCalled();
  });

  it('returns 400 when the invite has expired', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue({ ...validInvite, token_expires: new Date(Date.now() - 1000) });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITE_EXPIRED' }));
    expect(createUserInDb).not.toHaveBeenCalled();
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
  });

  it('returns 409 and keeps the invite row when the email registered (and verified) on its own', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue({ id: 'existing-user', email_verified_at: new Date() });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    //* Deleting it would leak the registration to the inviting company
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
    expect(createUserInDb).not.toHaveBeenCalled();
  });

  it('creates the user in the invited company and consumes the invite in the same transaction', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status: 'created', user: { id: 'new-user' } });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(createUserInDb).toHaveBeenCalledWith(expect.objectContaining({
      username: 'new@acme.test',
      companyId: 'company-1',
      roleId: 'role-member',
      roleName: 'company_member', //* Re-checked against the inviter under the company lock
      invitedBy: 'inviter-1',
      inviteId: 'invite-1',
      inviteToken: 'invite-token', //* The model consumes by id + digest + expiry
    }));
    //* Consumed inside the user-creation transaction, not afterwards
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({});
    expect(logAudit).toHaveBeenCalledWith(expect.anything(), 'auth.invite.accepted', { entity: 'user', entityId: 'new-user' });
  });

  it('claims an address held by an unverified account and cleans its company up after the commit', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue({ id: 'squatter', email_verified_at: null });
    const claimedDeletion = { status: 'deleted', companyDeleted: true, companyId: 'squatter-co' };
    createUserInDb.mockResolvedValue({ status: 'created', user: { id: 'new-user' }, claimedDeletion });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(createUserInDb).toHaveBeenCalled();
    expect(cleanupAfterUserDeletion).toHaveBeenCalledWith(claimedDeletion);
    expect(notifyUserDeleted).toHaveBeenCalledWith(claimedDeletion, 'system');
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('returns 409 and keeps the invite when the holder verified concurrently (in-transaction re-check)', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue({ id: 'squatter', email_verified_at: null });
    createUserInDb.mockResolvedValue({ status: 'already_registered' });
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
    expect(cleanupAfterUserDeletion).not.toHaveBeenCalled();
  });

  it('maps a concurrent-registration P2002 to 409 and keeps the invite row', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    //* Deleting it would leak the registration to the inviting company
    expect(deleteTeamInviteByIdSafe).not.toHaveBeenCalled();
    expect(notifyInviteAccepted).not.toHaveBeenCalled();
  });

  it('emits the invite-accepted business event (company, role - no email) after the user was created', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status: 'created', user: { id: 'new-user' } });

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, mockRes());

    expect(notifyInviteAccepted).toHaveBeenCalledWith({
      companyId: 'company-1',
      companyName: 'Acme Corp',
      roleName: 'company_member',
    });
    expect(JSON.stringify(notifyInviteAccepted.mock.calls)).not.toContain('new@acme.test');
  });

  it('answers 201 even while the business event send hangs', async () => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status: 'created', user: { id: 'new-user' } });
    notifyInviteAccepted.mockReturnValueOnce(new Promise(() => {}));
    const res = mockRes();

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, res);

    expect(res.status).toHaveBeenCalledWith(201);
  });

  it.each([
    ['invite_invalid'],
    ['inviter_invalid'],
  ])('emits nothing when the transaction answers %s', async (status) => {
    getTeamInviteByTokenInDb.mockResolvedValue(validInvite);
    getUserByEmail.mockResolvedValue(null);
    createUserInDb.mockResolvedValue({ status });

    await acceptTeamInvite({ body: { inviteToken: 'invite-token', password: 'Password123' } }, mockRes());

    expect(notifyInviteAccepted).not.toHaveBeenCalled();
  });
});
