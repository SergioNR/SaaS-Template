//* Seeded company roles form a hierarchy: an owner can grant everything an
//* admin can, and an admin everything a member has. "Holding" a role for
//* granting purposes therefore means holding it or any superior role.
export const COMPANY_ROLE_HIERARCHY = {
  company_owner: ['company_owner', 'company_admin', 'company_member'],
  company_admin: ['company_admin', 'company_member'],
  company_member: ['company_member'],
};

//* Numeric rank of each role - higher outranks lower. Unknown roles rank 0 so
//* a caller with no (or an unseeded) role can neither grant nor manage anything
export const COMPANY_ROLE_RANK = {
  company_owner: 3,
  company_admin: 2,
  company_member: 1,
};

const rankOf = (roleName) => COMPANY_ROLE_RANK[roleName] ?? 0;

export const highestRankOf = (roleNames) => Math.max(0, ...roleNames.map(rankOf));

//* Granting is "at or below own rank": an admin can invite / assign admins
export const rolesGrantableBy = (heldRoleNames) => {
  const grantableRoleNames = new Set();

  for (const heldRoleName of heldRoleNames) {
    for (const grantableRoleName of COMPANY_ROLE_HIERARCHY[heldRoleName] ?? []) {
      grantableRoleNames.add(grantableRoleName);
    }
  }

  return [...grantableRoleNames].sort();
};

export const canGrantRole = (heldRoleNames, targetRoleName) => rolesGrantableBy(heldRoleNames).includes(targetRoleName);

//* Strict outrank: every role the target holds ranks below the caller's
//* highest role. Building block of canManageMember
export const outranksAllRoles = (heldRoleNames, targetRoleNames) => {
  const callerRank = highestRankOf(heldRoleNames);

  if (callerRank === 0) {
    return false;
  }

  return targetRoleNames.every((roleName) => rankOf(roleName) < callerRank);
};

const COMPANY_OWNER_ROLE = 'company_owner';

//* Managing an existing member (removing them, changing their role) is
//* stricter than granting: the caller must OUTRANK every role the target
//* holds, so admins and members can never remove or demote their peers.
//* Owners are the exception: they are the accountable tier (the last one can
//* already take the whole company down by leaving), so an owner may manage
//* another owner - otherwise a second owner could never be removed. The
//* last-owner guard and "never yourself" are enforced by the callers
export const canManageMember = (heldRoleNames, targetRoleNames) => (
  outranksAllRoles(heldRoleNames, targetRoleNames)
  || (heldRoleNames.includes(COMPANY_OWNER_ROLE) && targetRoleNames.includes(COMPANY_OWNER_ROLE))
);
