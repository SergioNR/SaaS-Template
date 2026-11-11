import { describe, expect, it } from '@jest/globals';
import { runQuerySchema, failedPaths } from './helpers/checkQuerySchema.js';
import {
  ADMIN_LIST_FILTERS,
  buildAdminListFilterParameters,
  buildAdminListWhere,
  filterQueryParams,
} from '../server/utils/adminColumnFilters.js';
import {
  ADMIN_LIST_SORTS,
  buildAdminListSort,
  buildAdminListSortParameters,
} from '../server/utils/adminColumnSorts.js';
import { buildKeysetWhere, resolveListQueryArgs, DEFAULT_LIST_ORDER } from '../server/utils/cursorPagination.js';
import { adminUserListQueryValidationSchema } from '../server/utils/validators/adminUserListQuerySchema.js';
import { adminCompanyListQueryValidationSchema } from '../server/utils/validators/adminCompanyListQuerySchema.js';

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c0';

describe('admin filter registry - where fragments', () => {
  it('enum and ref filters match their column', () => {
    expect(buildAdminListWhere('users', { role: 'user', company_id: COMPANY_ID })).toEqual({ role: 'user', company_id: COMPANY_ID });
  });

  it('boolean filters map through their own fragment', () => {
    expect(buildAdminListWhere('companies', { stripe_linked: 'true' })).toEqual({ stripe_id: { not: null } });
    expect(buildAdminListWhere('companies', { stripe_linked: 'false' })).toEqual({ stripe_id: null });
  });

  it('date ranges are inclusive UTC days', () => {
    expect(buildAdminListWhere('users', { created_from: '2026-01-01', created_to: '2026-01-31' })).toEqual({
      created_at: { gte: new Date('2026-01-01T00:00:00.000Z'), lt: new Date('2026-02-01T00:00:00.000Z') },
    });
  });

  it('either bound of a range works alone', () => {
    expect(buildAdminListWhere('users', { last_login_from: '2026-03-01' })).toEqual({
      last_login_at: { gte: new Date('2026-03-01T00:00:00.000Z') },
    });
    expect(buildAdminListWhere('users', { last_login_to: '2026-03-01' })).toEqual({
      last_login_at: { lt: new Date('2026-03-02T00:00:00.000Z') },
    });
  });

  it('ignores parameters outside the registry', () => {
    expect(buildAdminListWhere('users', { hackerParam: 'x', password: 'y', search: 'z' })).toEqual({});
  });
});

describe('admin filter registry - validation', () => {
  it.each([
    ['users', adminUserListQueryValidationSchema, { company_id: 'not-a-uuid' }, ['company_id']],
    ['users', adminUserListQueryValidationSchema, { role: 'owner' }, ['role']],
    ['users', adminUserListQueryValidationSchema, { created_from: '2026-02-30' }, ['created_from']],
    ['users', adminUserListQueryValidationSchema, { last_login_to: 'yesterday' }, ['last_login_to']],
    ['users', adminUserListQueryValidationSchema, { created_from: '2026-02-01', created_to: '2026-01-01' }, ['created_to']],
    ['users', adminUserListQueryValidationSchema, { sort: 'password' }, ['sort']],
    ['users', adminUserListQueryValidationSchema, { sort: 'email', order: 'up' }, ['order']],
    ['companies', adminCompanyListQueryValidationSchema, { stripe_linked: 'yes' }, ['stripe_linked']],
    ['companies', adminCompanyListQueryValidationSchema, { sort: 'email' }, ['sort']],
  ])('%s list rejects %j', async (_list, schema, query, paths) => {
    const { errors } = await runQuerySchema(schema, query);

    expect(failedPaths(errors)).toEqual(paths);
  });

  it.each([
    [adminUserListQueryValidationSchema, {
      role: 'superadmin', company_id: COMPANY_ID, created_from: '2026-01-01', created_to: '2026-01-01', last_login_to: '2026-08-12', sort: 'last_login_at', order: 'desc',
    }],
    [adminUserListQueryValidationSchema, { last_login_from: '2026-01-01' }],
    [adminCompanyListQueryValidationSchema, { stripe_linked: 'false', created_to: '2026-01-31', sort: 'name' }],
  ])('accepts valid filters %#', async (schema, query) => {
    expect((await runQuerySchema(schema, query)).errors).toEqual([]);
  });

  it('keeps the existing role error message', async () => {
    const { errors } = await runQuerySchema(adminUserListQueryValidationSchema, { role: 'owner' });

    expect(errors[0].msg).toBe('Role filter must be one of: user, superadmin');
  });
});

describe('admin filter registry - OpenAPI parameters', () => {
  it.each(Object.keys(ADMIN_LIST_FILTERS))('%s documents every filter and sort parameter it validates', (list) => {
    const documented = [
      ...buildAdminListFilterParameters(list),
      ...buildAdminListSortParameters(list),
    ].map((parameter) => parameter.name);
    const declared = [...ADMIN_LIST_FILTERS[list].flatMap(filterQueryParams), 'sort', 'order'];

    expect(documented.sort()).toEqual(declared.sort());
  });
});

describe('admin sort whitelist', () => {
  it('keeps the default newest-first order without a sort', () => {
    expect(buildAdminListSort('users', undefined)).toBeNull();
  });

  it('defaults to ascending and adds the id tiebreaker in the same direction', () => {
    expect(buildAdminListSort('users', 'email').orderBy).toEqual([{ email: 'asc' }, { id: 'asc' }]);
    expect(buildAdminListSort('companies', 'created_at', 'desc').orderBy).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
  });

  it('sorts nullable columns with nulls last', () => {
    expect(buildAdminListSort('users', 'last_login_at', 'desc').orderBy).toEqual([
      { last_login_at: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('throws on a key outside the whitelist', () => {
    expect(() => buildAdminListSort('users', 'password')).toThrow(/Unknown sort/);
    expect(Object.keys(ADMIN_LIST_SORTS.users)).not.toContain('password');
  });
});

describe('keyset walk', () => {
  const lastLoginDesc = buildAdminListSort('users', 'last_login_at', 'desc');
  const at = new Date('2026-05-01T00:00:00.000Z');

  it('continues after a non-null cursor value, then into the null tail', () => {
    expect(buildKeysetWhere(lastLoginDesc, { id: 'u5', last_login_at: at })).toEqual({
      OR: [
        { last_login_at: { lt: at } },
        { AND: [{ last_login_at: at }, { id: { lt: 'u5' } }] },
        { last_login_at: null },
      ],
    });
  });

  it('stays in the null tail once the cursor row is null', () => {
    expect(buildKeysetWhere(lastLoginDesc, { id: 'u5', last_login_at: null })).toEqual({
      AND: [{ last_login_at: null }, { id: { lt: 'u5' } }],
    });
  });

  it('non-nullable columns have no null branch', () => {
    const emailAsc = buildAdminListSort('users', 'email');

    expect(buildKeysetWhere(emailAsc, { id: 'u1', email: 'b@x.test' })).toEqual({
      OR: [
        { email: { gt: 'b@x.test' } },
        { AND: [{ email: 'b@x.test' }, { id: { gt: 'u1' } }] },
      ],
    });
  });

  it('keeps Prisma cursor pagination for the default order', async () => {
    await expect(resolveListQueryArgs({ role: 'user' }, { limit: 10, cursor: 'u1' })).resolves.toEqual({
      where: { role: 'user' },
      orderBy: DEFAULT_LIST_ORDER,
      take: 10,
      skip: 1,
      cursor: { id: 'u1' },
    });
  });

  it('ANDs the keyset onto the filters for a sorted page after a cursor', async () => {
    const args = await resolveListQueryArgs({ role: 'user' }, { limit: 10, cursor: 'u5' }, lastLoginDesc, async () => ({ id: 'u5', last_login_at: null }));

    expect(args).toEqual({
      where: { AND: [{ role: 'user' }, { AND: [{ last_login_at: null }, { id: { lt: 'u5' } }] }] },
      orderBy: lastLoginDesc.orderBy,
      take: 10,
    });
  });

  it('resolves null when the cursor row no longer exists', async () => {
    await expect(resolveListQueryArgs({}, { limit: 10, cursor: 'gone' }, lastLoginDesc, async () => null)).resolves.toBeNull();
  });
});
