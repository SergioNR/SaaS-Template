import { jest } from '@jest/globals';
import { readdirSync } from 'node:fs';

//* The script imports the shared Prisma client - only the pure decision is
//* under test, so the client is stubbed (no database in unit tests)
jest.unstable_mockModule('../server/config/prismaClient.js', () => ({
  prisma: {},
}));

const {
  BASELINE_MIGRATION,
  LEGACY_MIGRATIONS,
  baselineAction,
} = await import('../prisma/baselineSquashedMigrations.js');

describe('baselineAction', () => {
  it('does nothing on a fresh database - migrate deploy applies the baseline', () => {
    expect(baselineAction(new Set()).action).toBe('none');
  });

  it('does nothing once the baseline is recorded', () => {
    expect(baselineAction(new Set([BASELINE_MIGRATION, ...LEGACY_MIGRATIONS])).action).toBe('none');
  });

  it('marks the baseline applied when the whole legacy history ran', () => {
    expect(baselineAction(new Set(LEGACY_MIGRATIONS)).action).toBe('resolve');
  });

  it('refuses a database that stopped part-way, naming what is missing', () => {
    const partial = new Set(LEGACY_MIGRATIONS.slice(0, -2));
    const result = baselineAction(partial);

    expect(result.action).toBe('refuse');
    expect(result.reason).toContain('20261111000002_rate_limit_hits');
    expect(result.reason).toContain('20261112100000_email_verification');
  });

  it('lists every legacy migration once', () => {
    expect(new Set(LEGACY_MIGRATIONS).size).toBe(LEGACY_MIGRATIONS.length);
    expect(LEGACY_MIGRATIONS).toHaveLength(15);
  });

  //* Prisma applies migration folders in name order - every later migration
  //* must sort after the baseline, and no folder may reuse a legacy name
  it('keeps the baseline first and never ships a legacy folder again', () => {
    const folders = readdirSync(new URL('../prisma/migrations/', import.meta.url), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(folders[0]).toBe(BASELINE_MIGRATION);
    expect(folders.filter((name) => LEGACY_MIGRATIONS.includes(name))).toEqual([]);
  });
});
