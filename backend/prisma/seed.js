import bcrypt from 'bcrypt';
import { prisma } from '../server/config/prismaClient.js';
import { BCRYPT_SALT_ROUNDS, FREE_TRIAL_DURATION_MS } from '../server/config/security.js';
import { isSeedAllowed } from './seedGuard.js';

const ACME_COMPANY_ID = '5f8b7c2e-1d4a-4f6b-8c3a-2a1b3c4d5e6f';

//* Role ids are only used when a role row does not exist yet (same
//* deterministic UUIDs as the team_invites_rbac migration). Assignments always
//* look the role up by name, so environments seeded with other ids still work
const roles = [
  {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'company_owner',
    permissions: ['team.view', 'team.invite', 'team.remove', 'team.manage_roles', 'files.view', 'files.upload', 'files.delete', 'billing.manage'],
  },
  {
    id: '00000000-0000-4000-8000-000000000002',
    name: 'company_admin',
    permissions: ['team.view', 'team.invite', 'team.remove', 'team.manage_roles', 'files.view', 'files.upload', 'files.delete'],
  },
  {
    id: '00000000-0000-4000-8000-000000000003',
    name: 'company_member',
    permissions: ['team.view', 'files.view', 'files.upload'],
  },
];

const permissions = [
  { id: '00000000-0000-4000-8000-000000000101', name: 'team.view' },
  { id: '00000000-0000-4000-8000-000000000102', name: 'team.invite' },
  { id: '00000000-0000-4000-8000-000000000103', name: 'team.remove' },
  { id: '00000000-0000-4000-8000-000000000104', name: 'team.manage_roles' },
  { id: '00000000-0000-4000-8000-000000000105', name: 'files.view' },
  { id: '00000000-0000-4000-8000-000000000106', name: 'files.upload' },
  { id: '00000000-0000-4000-8000-000000000107', name: 'files.delete' },
  { id: '00000000-0000-4000-8000-000000000108', name: 'billing.manage' },
];

const companies = [
  {
    id: ACME_COMPANY_ID,
    name: 'Acme Corp',
  },
];

//* Two independent role layers:
//* - `role` is the platform role (User.role): `user` for every tenant
//*   account, `superadmin` for SaaS-provider staff
//* - `companyRole` is the role inside the tenant company (UserRole)
//* The superadmin belongs to no company and holds no company role.
//* Acme gets an owner so the seeded company mirrors a real onboarding (the
//* registrant always becomes company_owner) and billing/owner-only flows work
const users = [
  {
    email: 'owner@acme.test',
    password: 'Password123!',
    role: 'user',
    companyRole: 'company_owner',
    company_id: ACME_COMPANY_ID,
  },
  {
    email: 'admin@acme.test',
    password: 'Password123!',
    role: 'user',
    companyRole: 'company_admin',
    company_id: ACME_COMPANY_ID,
  },
  {
    email: 'user@acme.test',
    password: 'Password123!',
    role: 'user',
    companyRole: 'company_member',
    company_id: ACME_COMPANY_ID,
  },
  {
    email: 'superadmin@platform.test',
    password: 'Password123!',
    role: 'superadmin',
    companyRole: null,
    company_id: null,
  },
];

async function main() {
  const roleIdsByName = {};

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: {},
      create: permission,
    });
  }

  for (const role of roles) {
    const createdRole = await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: {
        id: role.id,
        name: role.name,
      },
    });

    roleIdsByName[role.name] = createdRole.id;

    for (const permissionName of role.permissions) {
      const permissionRecord = await prisma.permission.findUnique({
        where: { name: permissionName },
      });

      await prisma.rolePermission.upsert({
        where: {
          role_id_permission_id: {
            role_id: createdRole.id,
            permission_id: permissionRecord.id,
          },
        },
        update: {},
        create: {
          role_id: createdRole.id,
          permission_id: permissionRecord.id,
        },
      });
    }
  }

  for (const company of companies) {
    await prisma.company.upsert({
      where: { id: company.id },
      update: { name: company.name },
      create: company,
    });

    //* Every company gets a trial subscription so the billing endpoints
    //* work out of the box for the seeded users
    await prisma.subscription.upsert({
      where: { company_id: company.id },
      update: {},
      create: {
        company_id: company.id,
        expires_at: new Date(Date.now() + FREE_TRIAL_DURATION_MS),
      },
    });
  }

  for (const user of users) {
    const { password, companyRole: companyRoleName, ...rest } = user;
    const createdUser = await prisma.user.upsert({
      where: { email: user.email },
      //* Re-seeding also repairs the role layers of rows from older seeds.
      //* Seeded accounts are always verified so they can log in right away
      update: { role: rest.role, company_id: rest.company_id, email_verified_at: new Date() },
      create: { ...rest, email_verified_at: new Date(), password: await bcrypt.hash(password, BCRYPT_SALT_ROUNDS) },
    });

    //* Replace (not upsert) the user's company roles: v1 keeps at most one
    //* role per user, so re-seeding must never leave duplicate role rows.
    //* Users without a company (superadmins) end up with none
    await prisma.$transaction([
      prisma.userRole.deleteMany({
        where: {
          user_id: createdUser.id,
        },
      }),
      ...(companyRoleName
        ? [prisma.userRole.create({
          data: {
            user_id: createdUser.id,
            role_id: roleIdsByName[companyRoleName],
          },
        })]
        : []),
    ]);

    //* The seed is a CLI script, not server code - console is the right output
    // eslint-disable-next-line no-console
    console.log(`Seeded user ${user.email} (${user.role}, ${companyRoleName ?? 'no company'})`);
  }
}

if (!isSeedAllowed()) {
  // eslint-disable-next-line no-console
  console.error('Refusing to seed: the seed creates accounts with a public password. Set DEPLOY_ENVIRONMENT=localhost, or ALLOW_SEED=1 to seed this database anyway');
  process.exitCode = 1;
} else {
  main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
