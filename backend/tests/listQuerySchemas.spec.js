import { runQuerySchema, runSchema, failedPaths } from './helpers/checkQuerySchema.js';
import { adminUserListQueryValidationSchema } from '../server/utils/validators/adminUserListQuerySchema.js';
import { adminCompanyListQueryValidationSchema } from '../server/utils/validators/adminCompanyListQuerySchema.js';
import { filesListQueryValidationSchema } from '../server/utils/validators/filesListQuerySchema.js';
import {
  cursorQueryField,
  limitQueryField,
  searchQueryField,
} from '../server/utils/validators/listQueryFields.js';

const VALID_UUID = '00000000-0000-4000-8000-0000000000aa';

const LIST_SCHEMAS = [
  ['admin users', adminUserListQueryValidationSchema],
  ['admin companies', adminCompanyListQueryValidationSchema],
  ['files', filesListQueryValidationSchema],
];

describe('shared list query fields', () => {
  it.each(LIST_SCHEMAS)('%s list spreads the shared limit and cursor rules', (_label, schema) => {
    expect(schema.limit).toBe(limitQueryField);
    expect(schema.cursor).toBe(cursorQueryField);
  });

  it('admin lists share the search rule', () => {
    expect(adminUserListQueryValidationSchema.search).toBe(searchQueryField);
    expect(adminCompanyListQueryValidationSchema.search).toBe(searchQueryField);
  });

  it.each(LIST_SCHEMAS)('%s list accepts an empty query and a valid page request', async (_label, schema) => {
    expect((await runQuerySchema(schema, {})).errors).toEqual([]);
    expect((await runQuerySchema(schema, { limit: '25', cursor: VALID_UUID })).errors).toEqual([]);
  });

  it.each(LIST_SCHEMAS)('%s list rejects limits outside 1..100', async (_label, schema) => {
    for (const limit of ['0', '101', 'ten', '-5']) {
      const { errors } = await runQuerySchema(schema, { limit });

      expect(failedPaths(errors)).toEqual(['limit']);
    }
  });

  it.each(LIST_SCHEMAS)('%s list rejects a non-uuid cursor', async (_label, schema) => {
    const { errors } = await runQuerySchema(schema, { cursor: 'not-a-uuid' });

    expect(failedPaths(errors)).toEqual(['cursor']);
  });
});

describe('search', () => {
  it('trims the term and caps it at 100 characters', async () => {
    const { req, errors } = await runQuerySchema(adminCompanyListQueryValidationSchema, { search: '  acme  ' });

    expect(errors).toEqual([]);
    expect(req.query.search).toBe('acme');

    const tooLong = await runQuerySchema(adminCompanyListQueryValidationSchema, { search: 'x'.repeat(101) });

    expect(failedPaths(tooLong.errors)).toEqual(['search']);
  });

  it('rejects an array (repeated ?search=)', async () => {
    const { errors } = await runQuerySchema(adminUserListQueryValidationSchema, { search: ['a', 'b'] });

    expect(failedPaths(errors)).toContain('search');
  });
});

describe('admin user role filter', () => {
  it('accepts only the platform roles', async () => {
    expect((await runQuerySchema(adminUserListQueryValidationSchema, { role: 'superadmin' })).errors).toEqual([]);

    const { errors } = await runQuerySchema(adminUserListQueryValidationSchema, { role: 'company_owner' });

    expect(failedPaths(errors)).toEqual(['role']);
  });
});

describe('list filters read only the query string', () => {
  it.each(LIST_SCHEMAS)('%s list ignores a limit sent in a JSON body', async (_label, schema) => {
    const { req, errors } = await runSchema(schema, { body: { limit: '0', cursor: 'not-a-uuid' }, query: {} });

    expect(errors).toEqual([]);
    expect(req.query.limit).toBeUndefined();
  });

  it('admin users ignores a role filter sent in a JSON body', async () => {
    const { errors } = await runSchema(adminUserListQueryValidationSchema, { body: { role: 'bogus' }, query: {} });

    expect(errors).toEqual([]);
  });
});
