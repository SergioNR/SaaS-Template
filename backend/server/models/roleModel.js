import { prisma } from '../config/prismaClient.js';

const roleWithPermissionsInclude = {
  RolePermissions: {
    include: {
      Permission: true,
    },
  },
};

export const getRoleByName = async (roleName) => {
  const getRoleByNameQuery = await prisma.role.findUnique({
    where: {
      name: roleName,
    },
    include: roleWithPermissionsInclude,
  });

  return getRoleByNameQuery;
};

//* Users are single-company in v1 (User.company_id FK), so the user's role
//* rows are implicitly scoped to their company
export const getUserCompanyRoles = async (userId) => {
  const getUserCompanyRolesQuery = await prisma.userRole.findMany({
    where: {
      user_id: userId,
    },
    include: {
      Role: {
        include: roleWithPermissionsInclude,
      },
    },
  });

  return getUserCompanyRolesQuery;
};

export const getUserCompanyRoleNames = async (userId) => {
  const userCompanyRoles = await getUserCompanyRoles(userId);

  return userCompanyRoles.map((userRole) => userRole.Role.name);
};

export const getUserCompanyPermissions = async (userId) => {
  const userCompanyRoles = await getUserCompanyRoles(userId);

  const permissionNames = userCompanyRoles.flatMap(
    (userRole) => userRole.Role.RolePermissions.map((rolePermission) => rolePermission.Permission.name),
  );

  return [...new Set(permissionNames)];
};
