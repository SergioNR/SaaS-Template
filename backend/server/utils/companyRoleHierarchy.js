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

//* Managing an existing member (removing them, changing their role) is
//* stricter than granting: the caller must OUTRANK every role the target
//* holds, so peers can never remove or demote each other (an admin cannot
//* touch another admin, an owner cannot touch another owner)
export const outranksAllRoles = (heldRoleNames, targetRoleNames) => {
  const callerRank = highestRankOf(heldRoleNames);

  if (callerRank === 0) {
    return false;
  }

  return targetRoleNames.every((roleName) => rankOf(roleName) < callerRank);
};
