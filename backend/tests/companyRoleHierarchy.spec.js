import {
  canGrantRole,
  highestRankOf,
  outranksAllRoles,
  canManageMember,
  rolesGrantableBy,
} from '../server/utils/companyRoleHierarchy.js';

describe('rolesGrantableBy / canGrantRole (at or below own rank)', () => {
  it('lets a role grant itself and everything below', () => {
    expect(rolesGrantableBy(['company_owner'])).toEqual(['company_admin', 'company_member', 'company_owner']);
    expect(rolesGrantableBy(['company_admin'])).toEqual(['company_admin', 'company_member']);
    expect(rolesGrantableBy(['company_member'])).toEqual(['company_member']);
    expect(canGrantRole(['company_admin'], 'company_admin')).toBe(true);
    expect(canGrantRole(['company_admin'], 'company_owner')).toBe(false);
  });

  it('grants nothing to users without roles or with unknown roles', () => {
    expect(rolesGrantableBy([])).toEqual([]);
    expect(rolesGrantableBy(['made_up'])).toEqual([]);
    expect(canGrantRole([], 'company_member')).toBe(false);
  });
});

describe('outranksAllRoles (strictly below own rank)', () => {
  it('ranks owner > admin > member and 0 for anything else', () => {
    expect(highestRankOf(['company_member', 'company_owner'])).toBe(3);
    expect(highestRankOf(['company_admin'])).toBe(2);
    expect(highestRankOf([])).toBe(0);
    expect(highestRankOf(['made_up'])).toBe(0);
  });

  it('refuses peers - an admin does not outrank another admin, an owner not another owner', () => {
    expect(outranksAllRoles(['company_admin'], ['company_admin'])).toBe(false);
    expect(outranksAllRoles(['company_owner'], ['company_owner'])).toBe(false);
    expect(outranksAllRoles(['company_owner'], ['company_admin'])).toBe(true);
    expect(outranksAllRoles(['company_admin'], ['company_member'])).toBe(true);
    expect(outranksAllRoles(['company_admin'], ['company_owner'])).toBe(false);
  });

  it('requires the caller to outrank EVERY role the target holds', () => {
    expect(outranksAllRoles(['company_owner'], ['company_member', 'company_admin'])).toBe(true);
    expect(outranksAllRoles(['company_admin'], ['company_member', 'company_admin'])).toBe(false);
  });

  it('never lets a role-less caller manage anyone, not even a role-less target', () => {
    expect(outranksAllRoles([], [])).toBe(false);
    expect(outranksAllRoles(['company_member'], [])).toBe(true);
  });
});

describe('canManageMember (strict outrank, or owner on owner)', () => {
  it('lets an owner manage another owner', () => {
    expect(canManageMember(['company_owner'], ['company_owner'])).toBe(true);
    expect(canManageMember(['company_owner'], ['company_owner', 'company_admin'])).toBe(true);
  });

  it('keeps admins from managing peers or owners', () => {
    expect(canManageMember(['company_admin'], ['company_admin'])).toBe(false);
    expect(canManageMember(['company_admin'], ['company_owner'])).toBe(false);
    expect(canManageMember(['company_admin'], ['company_member'])).toBe(true);
  });

  it('lets members manage nobody', () => {
    expect(canManageMember(['company_member'], ['company_member'])).toBe(false);
    expect(canManageMember(['company_member'], ['company_owner'])).toBe(false);
  });

  it('refuses unknown or missing caller roles', () => {
    expect(canManageMember([], ['company_member'])).toBe(false);
    expect(canManageMember(['made_up'], ['company_owner'])).toBe(false);
  });
});
