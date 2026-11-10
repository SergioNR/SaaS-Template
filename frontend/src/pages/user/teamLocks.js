//* Lock rules for the Team page, kept pure so they are unit-tested
//* (teamLocks.test.js). Per-row locks come from the API (`manageable`,
//* `callerId`); they are combined with the caller's permissions here, never
//* re-derived from role ranks. Labels are i18n keys - the page runs them
//* through t()

export const TEAM_PERMISSIONS = {
  invite: 'team.invite',
  remove: 'team.remove',
  manageRoles: 'team.manage_roles',
};

export const callerCapabilities = (callerPermissions = []) => ({
  canInvite: callerPermissions.includes(TEAM_PERMISSIONS.invite),
  canRemove: callerPermissions.includes(TEAM_PERMISSIONS.remove),
  canManageRoles: callerPermissions.includes(TEAM_PERMISSIONS.manageRoles),
});

export const memberLocks = ({ member, callerId, assignableRoles, capabilities }) => {
  const { canRemove, canManageRoles } = capabilities;

  //* The Select can only represent a single role that the caller is allowed
  //* to assign; other members (multi-role, or a role above the caller's
  //* reach such as the owner) keep their badge and a locked Select
  const currentRole = member.companyRoles.length === 1 ? member.companyRoles[0] : null;
  const roleNotAssignable = !currentRole || !assignableRoles.includes(currentRole);
  //* The API marks a member manageable only when the caller strictly
  //* outranks every role they hold; the caller's own row is never manageable
  const isSelf = callerId !== null && callerId !== undefined && member.id === callerId;
  const outranked = !member.manageable;
  const rankLockLabel = isSelf ? 'team.locked.self' : 'team.locked.notOutranked';

  const roleLocked = !canManageRoles || isSelf || outranked || roleNotAssignable;
  let roleLockLabel = 'team.locked.roleNotAssignable';

  if (!canManageRoles) {
    roleLockLabel = 'team.locked.manageRoles';
  } else if (isSelf || outranked) {
    roleLockLabel = rankLockLabel;
  }

  const removeLocked = !canRemove || isSelf || outranked;
  const removeLockLabel = !canRemove ? 'team.locked.remove' : rankLockLabel;

  return {
    currentRole,
    roleNotAssignable,
    roleLocked,
    roleLockLabel,
    removeLocked,
    removeLockLabel,
  };
};

//* `manageable` on an invite = the caller can grant the invite's role
export const inviteLocks = ({ invite, capabilities }) => {
  const locked = !capabilities.canInvite || !invite.manageable;

  return {
    locked,
    lockLabel: !capabilities.canInvite ? 'team.locked.invite' : 'team.locked.inviteRole',
  };
};

//* The header "Invite" button: while the team is still loading (or failed)
//* the permissions are unknown - the button is disabled without claiming the
//* caller lacks permission. The tooltip only shows once we know they do
export const inviteButtonState = ({ permissionsKnown, capabilities }) => ({
  disabled: !permissionsKnown || !capabilities.canInvite,
  showLockTooltip: permissionsKnown && !capabilities.canInvite,
});
