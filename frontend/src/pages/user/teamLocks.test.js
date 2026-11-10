import { describe, expect, it } from 'vitest';
import { callerCapabilities, inviteButtonState, inviteLocks, memberLocks } from './teamLocks.js';

const ALL = ['team.invite', 'team.remove', 'team.manage_roles'];
const ASSIGNABLE = ['company_admin', 'company_member'];

const member = (overrides = {}) => ({
  id: 'm1',
  email: 'member@example.com',
  companyRoles: ['company_member'],
  manageable: true,
  ...overrides,
});

const locksFor = (memberOverrides, { permissions = ALL, callerId = 'caller' } = {}) =>
  memberLocks({
    member: member(memberOverrides),
    callerId,
    assignableRoles: ASSIGNABLE,
    capabilities: callerCapabilities(permissions),
  });

describe('callerCapabilities', () => {
  it('maps permission names to flags', () => {
    expect(callerCapabilities(['team.invite'])).toEqual({
      canInvite: true,
      canRemove: false,
      canManageRoles: false,
    });
    expect(callerCapabilities()).toEqual({ canInvite: false, canRemove: false, canManageRoles: false });
  });
});

describe('memberLocks', () => {
  it('unlocks a manageable member with an assignable role for a full-permission caller', () => {
    expect(locksFor({})).toMatchObject({
      currentRole: 'company_member',
      roleNotAssignable: false,
      roleLocked: false,
      removeLocked: false,
    });
  });

  it('locks role and removal on the caller’s own row', () => {
    expect(locksFor({ id: 'caller' })).toMatchObject({
      roleLocked: true,
      roleLockLabel: 'team.locked.self',
      removeLocked: true,
      removeLockLabel: 'team.locked.self',
    });
  });

  it('locks members the API marks as not manageable (not outranked)', () => {
    expect(locksFor({ manageable: false, companyRoles: ['company_owner'] })).toMatchObject({
      roleLocked: true,
      roleLockLabel: 'team.locked.notOutranked',
      removeLocked: true,
      removeLockLabel: 'team.locked.notOutranked',
    });
  });

  it('missing permissions take precedence in the lock label', () => {
    expect(locksFor({ manageable: false }, { permissions: [] })).toMatchObject({
      roleLockLabel: 'team.locked.manageRoles',
      removeLockLabel: 'team.locked.remove',
    });
  });

  it('locks only the role select for multi-role or non-assignable roles', () => {
    expect(locksFor({ companyRoles: ['company_admin', 'company_member'] })).toMatchObject({
      currentRole: null,
      roleLocked: true,
      roleLockLabel: 'team.locked.roleNotAssignable',
      removeLocked: false,
    });
    expect(locksFor({ companyRoles: ['company_owner'] })).toMatchObject({
      roleNotAssignable: true,
      roleLocked: true,
      removeLocked: false,
    });
  });

  it('remove permission alone unlocks removal but not role changes', () => {
    expect(locksFor({}, { permissions: ['team.remove'] })).toMatchObject({
      roleLocked: true,
      roleLockLabel: 'team.locked.manageRoles',
      removeLocked: false,
    });
  });

  it('never treats a null callerId as matching a row', () => {
    expect(locksFor({ id: null }, { callerId: null }).removeLocked).toBe(false);
  });
});

describe('inviteLocks', () => {
  it('needs both the invite permission and a manageable invite', () => {
    const canInvite = callerCapabilities(['team.invite']);

    expect(inviteLocks({ invite: { manageable: true }, capabilities: canInvite })).toEqual({
      locked: false,
      lockLabel: 'team.locked.inviteRole',
    });
    expect(inviteLocks({ invite: { manageable: false }, capabilities: canInvite })).toEqual({
      locked: true,
      lockLabel: 'team.locked.inviteRole',
    });
    expect(inviteLocks({ invite: { manageable: true }, capabilities: callerCapabilities([]) })).toEqual({
      locked: true,
      lockLabel: 'team.locked.invite',
    });
  });
});

describe('inviteButtonState', () => {
  it('stays disabled without a permission tooltip while permissions are unknown', () => {
    expect(inviteButtonState({ permissionsKnown: false, capabilities: callerCapabilities([]) })).toEqual({
      disabled: true,
      showLockTooltip: false,
    });
  });

  it('shows the tooltip only when the caller is known to lack the permission', () => {
    expect(inviteButtonState({ permissionsKnown: true, capabilities: callerCapabilities([]) })).toEqual({
      disabled: true,
      showLockTooltip: true,
    });
    expect(inviteButtonState({ permissionsKnown: true, capabilities: callerCapabilities(['team.invite']) })).toEqual({
      disabled: false,
      showLockTooltip: false,
    });
  });
});
