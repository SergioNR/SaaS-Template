import { execFileSync } from 'node:child_process';
import { prisma } from '../server/config/prismaClient.js';

//* ---------------------------------------------------------------------------
//* One-time bridge for the 2026-11-11 migration squash: the whole history up
//* to 20261112100000_email_verification lives in 0_init. `prisma migrate
//* deploy` on a database that already ran the old history would re-run 0_init
//* and fail on the existing tables, so start.sh runs this first:
//* - fresh database (no history)          -> nothing; deploy applies 0_init
//* - 0_init already recorded              -> nothing
//* - every legacy migration applied       -> mark 0_init as applied (the
//*   schema is identical), then deploy continues with anything newer
//* - only part of the legacy history      -> refuse to start: marking 0_init
//*   would silently skip the missing changes. Deploy the last pre-squash
//*   image first so the old history completes, then this one
//* Safe to delete once every environment has 0_init recorded.
//* ---------------------------------------------------------------------------

export const BASELINE_MIGRATION = '0_init';

//* Frozen - exactly the migrations folded into 0_init. Never add to it: a new
//* migration sorts after 0_init and is applied by deploy as usual
export const LEGACY_MIGRATIONS = [
  '20261019000000_init',
  '20261019100000_session_user_cascades',
  '20261020153401_team_invites_rbac',
  '20261021090000_company_admin_manage_roles',
  '20261021090000_file_uploads',
  '20261021120000_secure_tokens',
  '20261021120100_file_upload_status',
  '20261021120200_billing_manage_permission',
  '20261021130000_superadmin_role',
  '20261021160000_detach_superadmins',
  '20261110090000_subscription_stripe_fields',
  '20261110100000_indexes_fks_citext_emails',
  '20261111000001_file_cleanup_failed_at',
  '20261111000002_rate_limit_hits',
  '20261112100000_email_verification',
];

//* Pure decision so the rules are unit-testable: `applied` is the set of
//* migration names recorded as finished (and not rolled back)
export const baselineAction = (applied) => {
  if (applied.has(BASELINE_MIGRATION)) {
    return { action: 'none', reason: `${BASELINE_MIGRATION} already recorded` };
  }

  const appliedLegacy = LEGACY_MIGRATIONS.filter((name) => applied.has(name));

  if (appliedLegacy.length === 0) {
    return { action: 'none', reason: 'no pre-squash history - migrate deploy applies the baseline' };
  }

  const missing = LEGACY_MIGRATIONS.filter((name) => !applied.has(name));

  if (missing.length > 0) {
    return {
      action: 'refuse',
      reason: `the database stopped part-way through the pre-squash history (missing ${missing.join(', ')}). `
        + 'Deploy the last pre-squash image (the <branch>-<sha> tag of the commit before the migration squash) first so it completes, then this image.',
    };
  }

  return { action: 'resolve', reason: 'complete pre-squash history - marking the baseline as applied' };
};

const readAppliedMigrations = async () => {
  const [{ exists }] = await prisma.$queryRaw`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS "exists"
  `;

  if (!exists) {
    return new Set();
  }

  const rows = await prisma.$queryRaw`
    SELECT migration_name FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;

  return new Set(rows.map((row) => row.migration_name));
};

const main = async () => {
  const applied = await readAppliedMigrations();
  const { action, reason } = baselineAction(applied);

  //* A CLI step of start.sh, not server code - plain console output, like the
  //* prisma CLI around it
  // eslint-disable-next-line no-console
  console.log(`[baseline] ${reason}`);

  if (action === 'refuse') {
    throw new Error(`[baseline] Refusing to start: ${reason}`);
  }

  if (action === 'resolve') {
    execFileSync('npx', ['prisma', 'migrate', 'resolve', '--applied', BASELINE_MIGRATION], { stdio: 'inherit' });
  }
};

//* Only run when executed directly - the spec imports the pure helpers
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
