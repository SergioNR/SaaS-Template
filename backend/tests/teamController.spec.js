import { jest } from '@jest/globals';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  canCompanyMemberGrantRoleInDb: jest.fn(),
  getUserByEmail: jest.fn(),
  getCompanyMembersInDb: jest.fn(),
  getOneCompanyMemberInDb: jest.fn(),
  updateCompanyMemberRoleInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/teamInvitesModel.js', () => ({
  createTeamInviteInDb: jest.fn(),
  getTeamInviteByIdInDb: jest.fn(),
  getPendingTeamInviteByCompanyAndEmailInDb: jest.fn(),
  getCompanyPendingInvitesInDb: jest.fn(),
  deleteTeamInviteInDb: jest.fn(),
  rotateTeamInviteTokenInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/models/roleModel.js', () => ({
  getAllPermissionNames: jest.fn(),
  getAllRolesWithPermissions: jest.fn(),
  getUserCompanyPermissions: jest.fn(),
  getUserCompanyRoleNames: jest.fn(),
  getRoleByName: jest.fn(),
}));

jest.unstable_mockModule('../server/models/companyModel.js', () => ({
  getCompanyByIdInDb: jest.fn(),
}));

jest.unstable_mockModule('../server/utils/userDeletionCleanup.js', () => ({
  deleteUserAndCleanup: jest.fn(),
}));

jest.unstable_mockModule('../server/config/loggerFunctions.js', () => ({
  logError: jest.fn(),
  logWarn: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/sendTeamInviteToUser.js', () => ({
  sendTeamInviteToUser: jest.fn(),
}));

jest.unstable_mockModule('../server/integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js', () => ({
  sendExistingAccountNoticeToUser: jest.fn(),
}));

const {
  createTeamInvite,
  getTeamData,
  removeTeamMember,
  resendTeamInvite,
  revokeTeamInvite,
  updateTeamMemberRole,
} = await import('../server/controllers/teamController.js');
const {
  canCompanyMemberGrantRoleInDb,
  getUserByEmail,
  getCompanyMembersInDb,
  getOneCompanyMemberInDb,
  updateCompanyMemberRoleInDb,
} = await import('../server/models/userModel.js');
const {
  createTeamInviteInDb,
  getTeamInviteByIdInDb,
  getPendingTeamInviteByCompanyAndEmailInDb,
  getCompanyPendingInvitesInDb,
  deleteTeamInviteInDb,
  rotateTeamInviteTokenInDb,
} = await import('../server/models/teamInvitesModel.js');
const {
  getAllPermissionNames,
  getUserCompanyPermissions,
  getUserCompanyRoleNames,
  getRoleByName,
} = await import('../server/models/roleModel.js');
const { getCompanyByIdInDb } = await import('../server/models/companyModel.js');
const { deleteUserAndCleanup } = await import('../server/utils/userDeletionCleanup.js');
const { logError } = await import('../server/config/loggerFunctions.js');
const { sendTeamInviteToUser } = await import('../server/integrations/brevo/transactionalEmails/sendTeamInviteToUser.js');
const { sendExistingAccountNoticeToUser } = await import('../server/integrations/brevo/transactionalEmails/sendExistingAccountNoticeToUser.js');

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  return res;
};

//* Lets detached (fire-and-forget) work finish before asserting on it
const flushBackgroundWork = () => new Promise((resolve) => { setTimeout(resolve, 0); });

const caller = {
  id: 'caller-id',
  email: 'owner@acme.test',
  role: 'user',
  company_id: 'company-1',
};

const memberRecord = (id, email, companyRoles, role = 'user') => ({
  id,
  email,
  role,
  created_at: '2026-01-01T00:00:00.000Z',
  UserRoles: companyRoles.map((name) => ({ Role: { id: `role-${name}`, name } })),
});

describe('getTeamData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the caller id, members, invites, caller permissions and assignable roles', async () => {
    getCompanyMembersInDb.mockResolvedValue([memberRecord('caller-id', 'owner@acme.test', ['company_owner'])]);
    getCompanyPendingInvitesInDb.mockResolvedValue([
      {
        id: 'invite-1', email: 'new@acme.test', token_expires: '2026-01-08', created_at: '2026-01-01', Role: { name: 'company_member' },
      },
    ]);
    getUserCompanyPermissions.mockResolvedValue(['team.view', 'team.invite']);
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);

    const res = mockRes();

    await getTeamData({ user: caller }, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      callerId: 'caller-id',
      members: [expect.objectContaining({ email: 'owner@acme.test', companyRoles: ['company_owner'] })],
      invites: [expect.objectContaining({ email: 'new@acme.test', role: 'company_member' })],
      callerPermissions: ['team.view', 'team.invite'],
      assignableRoles: ['company_admin', 'company_member', 'company_owner'],
    }));
  });

  it('flags members as manageable only when the caller outranks all their roles and they are not the caller', async () => {
    getCompanyMembersInDb.mockResolvedValue([
      memberRecord('caller-id', 'admin@acme.test', ['company_admin']),
      memberRecord('owner-id', 'owner@acme.test', ['company_owner']),
      memberRecord('peer-id', 'peer@acme.test', ['company_admin']),
      memberRecord('member-id', 'member@acme.test', ['company_member']),
    ]);
    getCompanyPendingInvitesInDb.mockResolvedValue([]);
    getUserCompanyPermissions.mockResolvedValue(['team.view']);
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);

    const res = mockRes();

    await getTeamData({ user: caller }, res);

    const { members } = res.json.mock.calls[0][0];
    expect(members.map(({ id, manageable }) => ({ id, manageable }))).toEqual([
      { id: 'caller-id', manageable: false },
      { id: 'owner-id', manageable: false },
      { id: 'peer-id', manageable: false },
      { id: 'member-id', manageable: true },
    ]);
  });

  it('never flags the caller as manageable, even when their role would allow it', async () => {
    getCompanyMembersInDb.mockResolvedValue([memberRecord('caller-id', 'owner@acme.test', ['company_member'])]);
    getCompanyPendingInvitesInDb.mockResolvedValue([]);
    getUserCompanyPermissions.mockResolvedValue(['team.view']);
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);

    const res = mockRes();

    await getTeamData({ user: caller }, res);

    expect(res.json.mock.calls[0][0].members[0].manageable).toBe(false);
  });

  it('flags invites as manageable when the caller can grant their role', async () => {
    getCompanyMembersInDb.mockResolvedValue([]);
    getCompanyPendingInvitesInDb.mockResolvedValue([
      {
        id: 'invite-owner', email: 'o@acme.test', token_expires: '2026-01-08', created_at: '2026-01-01', Role: { name: 'company_owner' },
      },
      {
        id: 'invite-admin', email: 'a@acme.test', token_expires: '2026-01-08', created_at: '2026-01-01', Role: { name: 'company_admin' },
      },
    ]);
    getUserCompanyPermissions.mockResolvedValue(['team.view']);
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);

    const res = mockRes();

    await getTeamData({ user: caller }, res);

    const { invites } = res.json.mock.calls[0][0];
    expect(invites.map(({ id, manageable }) => ({ id, manageable }))).toEqual([
      { id: 'invite-owner', manageable: false },
      { id: 'invite-admin', manageable: true },
    ]);
  });

  it('derives permissions from company roles only, even for superadmins', async () => {
    getCompanyMembersInDb.mockResolvedValue([]);
    getCompanyPendingInvitesInDb.mockResolvedValue([]);
    getUserCompanyPermissions.mockResolvedValue(['team.view']);
    getUserCompanyRoleNames.mockResolvedValue(['company_member']);

    const res = mockRes();

    await getTeamData({ user: { ...caller, role: 'superadmin' } }, res);

    expect(getAllPermissionNames).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      callerPermissions: ['team.view'],
      assignableRoles: ['company_member'],
    }));
  });
});

describe('createTeamInvite', () => {
  const inviteBody = { email: 'new@acme.test', roleName: 'company_member' };

  const createdInvite = {
    id: 'invite-1',
    email: 'new@acme.test',
    company_id: 'company-1',
    token_expires: new Date('2026-01-08T00:00:00.000Z'),
    created_at: new Date('2026-01-01T00:00:00.000Z'),
  };

  const expectedResponse = {
    invite: {
      id: 'invite-1',
      email: 'new@acme.test',
      role: 'company_member',
      token_expires: createdInvite.token_expires,
      created_at: createdInvite.created_at,
    },
  };

  const allowCreation = () => {
    getPendingTeamInviteByCompanyAndEmailInDb.mockResolvedValue(null);
    getRoleByName.mockResolvedValue({ id: 'role-member', name: 'company_member' });
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCompanyByIdInDb.mockResolvedValue({ id: 'company-1', name: 'Acme Corp' });
    createTeamInviteInDb.mockResolvedValue({ invite: createdInvite, inviteToken: 'raw-secret-token' });
  });

  it('returns 409 when an invite is already pending for the email (company-scoped, not an enumeration)', async () => {
    getPendingTeamInviteByCompanyAndEmailInDb.mockResolvedValue({ id: 'invite-1' });
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(createTeamInviteInDb).not.toHaveBeenCalled();
  });

  it('returns 404 when the role does not exist', async () => {
    getPendingTeamInviteByCompanyAndEmailInDb.mockResolvedValue(null);
    getRoleByName.mockResolvedValue(null);
    const res = mockRes();

    await createTeamInvite({ user: caller, body: { email: 'new@acme.test', roleName: 'made_up_role' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when the caller invites to a role they do not hold', async () => {
    getPendingTeamInviteByCompanyAndEmailInDb.mockResolvedValue(null);
    getRoleByName.mockResolvedValue({ id: 'role-owner', name: 'company_owner' });
    getUserCompanyRoleNames.mockResolvedValue(['company_member']);
    const res = mockRes();

    await createTeamInvite({ user: caller, body: { email: 'new@acme.test', roleName: 'company_owner' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(createTeamInviteInDb).not.toHaveBeenCalled();
  });

  it('does not let superadmins grant company roles they do not hold', async () => {
    getPendingTeamInviteByCompanyAndEmailInDb.mockResolvedValue(null);
    getRoleByName.mockResolvedValue({ id: 'role-owner', name: 'company_owner' });
    getUserCompanyRoleNames.mockResolvedValue([]);
    const res = mockRes();

    await createTeamInvite({ user: { ...caller, role: 'superadmin' }, body: { email: 'new@acme.test', roleName: 'company_owner' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(createTeamInviteInDb).not.toHaveBeenCalled();
  });

  it('persists the row before responding and only looks the account up afterwards', async () => {
    allowCreation();
    let resolveLookup;
    getUserByEmail.mockReturnValue(new Promise((resolve) => { resolveLookup = resolve; }));
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);

    expect(createTeamInviteInDb).toHaveBeenCalledWith({
      email: 'new@acme.test',
      companyId: 'company-1',
      roleId: 'role-member',
      invitedBy: 'caller-id',
    });
    expect(createTeamInviteInDb.mock.invocationCallOrder[0]).toBeLessThan(res.status.mock.invocationCallOrder[0]);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedResponse);
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();

    resolveLookup(null);
    await flushBackgroundWork();

    expect(sendTeamInviteToUser).toHaveBeenCalledTimes(1);
  });

  it('emails the raw token to an unregistered address and never returns it', async () => {
    allowCreation();
    getUserByEmail.mockResolvedValue(null);
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);
    await flushBackgroundWork();

    expect(sendTeamInviteToUser).toHaveBeenCalledWith('new@acme.test', 'raw-secret-token', 'Acme Corp', 'owner@acme.test');
    expect(sendExistingAccountNoticeToUser).not.toHaveBeenCalled();
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('raw-secret-token');
  });

  it('creates the row for an already-registered email too, answers the identical 201 and sends no email', async () => {
    allowCreation();
    getUserByEmail.mockResolvedValue({ id: 'existing-user', email: 'new@acme.test' });
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);
    await flushBackgroundWork();

    expect(createTeamInviteInDb).toHaveBeenCalledWith({
      email: 'new@acme.test',
      companyId: 'company-1',
      roleId: 'role-member',
      invitedBy: 'caller-id',
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expectedResponse);
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();
    expect(sendExistingAccountNoticeToUser).not.toHaveBeenCalled();
  });

  it('maps a concurrent-creation P2002 to the same 409 as a pending invite', async () => {
    allowCreation();
    createTeamInviteInDb.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);
    await flushBackgroundWork();

    expect(res.status).toHaveBeenCalledWith(409);
    expect(getUserByEmail).not.toHaveBeenCalled();
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();
  });

  it('rethrows other creation errors', async () => {
    allowCreation();
    createTeamInviteInDb.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await expect(createTeamInvite({ user: caller, body: inviteBody }, res)).rejects.toThrow('db down');
  });

  it('logs background delivery failures without affecting the response', async () => {
    allowCreation();
    getUserByEmail.mockRejectedValue(new Error('db down'));
    const res = mockRes();

    await createTeamInvite({ user: caller, body: inviteBody }, res);
    await flushBackgroundWork();

    expect(res.status).toHaveBeenCalledWith(201);
    expect(logError).toHaveBeenCalled();
  });
});

describe('resendTeamInvite', () => {
  const pendingInvite = {
    id: 'invite-1', email: 'new@acme.test', role_id: 'role-member', invited_by: 'original-inviter', Role: { id: 'role-member', name: 'company_member' },
  };

  const rotatedInvite = {
    id: 'invite-1', email: 'new@acme.test', token_expires: '2026-01-15', created_at: '2026-01-01',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getCompanyByIdInDb.mockResolvedValue({ id: 'company-1', name: 'Acme Corp' });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    canCompanyMemberGrantRoleInDb.mockResolvedValue(true);
  });

  it('returns 404 when the invite does not exist in the caller company', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(null);
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when the caller cannot grant the invited role', async () => {
    getTeamInviteByIdInDb.mockResolvedValue({ ...pendingInvite, Role: { id: 'role-owner', name: 'company_owner' } });
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(rotateTeamInviteTokenInDb).not.toHaveBeenCalled();
  });

  it('rotates the token in place without re-attributing the invite, emails the new raw token and never returns it', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(pendingInvite);
    getUserByEmail.mockResolvedValue(null);
    rotateTeamInviteTokenInDb.mockResolvedValue({ invite: rotatedInvite, inviteToken: 'rotated-secret-token' });
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);
    await flushBackgroundWork();

    expect(rotateTeamInviteTokenInDb).toHaveBeenCalledWith('invite-1', 'company-1');
    expect(createTeamInviteInDb).not.toHaveBeenCalled();
    expect(sendTeamInviteToUser).toHaveBeenCalledWith('new@acme.test', 'rotated-secret-token', 'Acme Corp', 'owner@acme.test');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      invite: expect.objectContaining({ id: 'invite-1', role: 'company_member' }),
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('rotated-secret-token');
  });

  it('answers the same 200 when the invitee registered on their own, keeping the row and sending nothing', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(pendingInvite);
    getUserByEmail.mockResolvedValue({ id: 'existing-user' });
    rotateTeamInviteTokenInDb.mockResolvedValue({ invite: rotatedInvite, inviteToken: 'rotated-secret-token' });
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(rotateTeamInviteTokenInDb).toHaveBeenCalledWith('invite-1', 'company-1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      invite: expect.objectContaining({ id: 'invite-1', role: 'company_member' }),
    });

    await flushBackgroundWork();

    expect(deleteTeamInviteInDb).not.toHaveBeenCalled();
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();
  });

  it('returns 409 INVITER_INVALID without rotating when the original inviter can no longer grant the role', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(pendingInvite);
    canCompanyMemberGrantRoleInDb.mockResolvedValue(false);
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(canCompanyMemberGrantRoleInDb).toHaveBeenCalledWith('original-inviter', 'company-1', 'company_member');
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INVITER_INVALID' }));
    expect(rotateTeamInviteTokenInDb).not.toHaveBeenCalled();
  });

  it('returns 404 when the invite disappeared before the rotation', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(pendingInvite);
    rotateTeamInviteTokenInDb.mockResolvedValue(null);
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);
    await flushBackgroundWork();

    expect(res.status).toHaveBeenCalledWith(404);
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();
  });

  it('maps a rotation P2002 to 409', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(pendingInvite);
    rotateTeamInviteTokenInDb.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));
    const res = mockRes();

    await resendTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(sendTeamInviteToUser).not.toHaveBeenCalled();
  });
});

describe('revokeTeamInvite', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 404 when the invite does not exist in the caller company', async () => {
    getTeamInviteByIdInDb.mockResolvedValue(null);
    const res = mockRes();

    await revokeTeamInvite({ user: caller, params: { inviteId: 'missing' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when the caller cannot grant the invited role', async () => {
    getTeamInviteByIdInDb.mockResolvedValue({ id: 'invite-1', Role: { name: 'company_owner' } });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await revokeTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(deleteTeamInviteInDb).not.toHaveBeenCalled();
  });

  it('deletes the invite scoped by company', async () => {
    getTeamInviteByIdInDb.mockResolvedValue({ id: 'invite-1', Role: { name: 'company_member' } });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    deleteTeamInviteInDb.mockResolvedValue(true);
    const res = mockRes();

    await revokeTeamInvite({ user: caller, params: { inviteId: 'invite-1' } }, res);

    expect(deleteTeamInviteInDb).toHaveBeenCalledWith('invite-1', 'company-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('removeTeamMember', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 409 on self-removal', async () => {
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'caller-id' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });

  it('returns 404 when the target is not a member of the caller company', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(null);
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'outsider' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when a company admin tries to remove an owner', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'owner2@acme.test', ['company_owner']));
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });

  it('returns 403 for peers - an admin cannot remove another admin, an owner cannot remove another owner', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'admin2@acme.test', ['company_admin']));
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const adminRes = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, adminRes);

    expect(adminRes.status).toHaveBeenCalledWith(403);

    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'owner2@acme.test', ['company_owner']));
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);
    const ownerRes = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, ownerRes);

    expect(ownerRes.status).toHaveBeenCalledWith(403);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });

  it('returns 409 when the transaction reports the last company owner', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);
    deleteUserAndCleanup.mockResolvedValue({ status: 'last_owner' });
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 403 when the rank re-check inside the transaction fails', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    deleteUserAndCleanup.mockResolvedValue({ status: 'forbidden' });
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('deletes the member through the guarded transactional cleanup, handing the caller id to the lock', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    deleteUserAndCleanup.mockResolvedValue({ status: 'deleted', deletedUser: { id: 'target' } });
    const res = mockRes();

    await removeTeamMember({ user: caller, params: { userId: 'target' } }, res);

    expect(deleteUserAndCleanup).toHaveBeenCalledWith('target', {
      companyId: 'company-1',
      protectLastOwner: true,
      callerId: 'caller-id',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ userId: 'target' });
  });

  it('restricts target roles for superadmins like for anyone else', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'owner2@acme.test', ['company_owner']));
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await removeTeamMember({ user: { ...caller, role: 'superadmin' }, params: { userId: 'target' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(deleteUserAndCleanup).not.toHaveBeenCalled();
  });
});

describe('updateTeamMemberRole', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 409 on self-change', async () => {
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'caller-id' }, body: { roleName: 'company_member' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(updateCompanyMemberRoleInDb).not.toHaveBeenCalled();
  });

  it('returns 404 when the role does not exist', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getRoleByName.mockResolvedValue(null);
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'made_up' } }, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 403 when the caller assigns a role they do not hold', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getRoleByName.mockResolvedValue({ id: 'role-owner', name: 'company_owner' });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_owner' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompanyMemberRoleInDb).not.toHaveBeenCalled();
  });

  it('returns 403 when a company admin tries to demote an owner', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'owner2@acme.test', ['company_owner']));
    getRoleByName.mockResolvedValue({ id: 'role-member', name: 'company_member' });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_member' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompanyMemberRoleInDb).not.toHaveBeenCalled();
  });

  it('returns 403 when an admin tries to change a peer admin, even to a role they could grant', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'admin2@acme.test', ['company_admin']));
    getRoleByName.mockResolvedValue({ id: 'role-member', name: 'company_member' });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_member' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateCompanyMemberRoleInDb).not.toHaveBeenCalled();
  });

  it('lets an owner promote a member to admin', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    const adminRole = { id: 'role-admin', name: 'company_admin' };
    getRoleByName.mockResolvedValue(adminRole);
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);
    updateCompanyMemberRoleInDb.mockResolvedValue({
      status: 'updated',
      member: memberRecord('target', 'peer@acme.test', ['company_admin']),
    });
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_admin' } }, res);

    expect(updateCompanyMemberRoleInDb).toHaveBeenCalledWith('target', 'company-1', adminRole, {
      callerId: 'caller-id',
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      member: expect.objectContaining({ companyRoles: ['company_admin'] }),
    }));
  });

  it('returns 409 when the transaction reports the last company owner', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getRoleByName.mockResolvedValue({ id: 'role-member', name: 'company_member' });
    getUserCompanyRoleNames.mockResolvedValue(['company_owner']);
    updateCompanyMemberRoleInDb.mockResolvedValue({ status: 'last_owner' });
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_member' } }, res);

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('returns 403 when the rank re-check inside the transaction fails', async () => {
    getOneCompanyMemberInDb.mockResolvedValue(memberRecord('target', 'peer@acme.test', ['company_member']));
    getRoleByName.mockResolvedValue({ id: 'role-member', name: 'company_member' });
    getUserCompanyRoleNames.mockResolvedValue(['company_admin']);
    updateCompanyMemberRoleInDb.mockResolvedValue({ status: 'forbidden' });
    const res = mockRes();

    await updateTeamMemberRole({ user: caller, params: { userId: 'target' }, body: { roleName: 'company_member' } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
  });
});
