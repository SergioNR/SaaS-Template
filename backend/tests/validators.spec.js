import { describe, expect, test } from '@jest/globals';
import { runSchema as run, failedPaths } from './helpers/checkQuerySchema.js';
import { createUserValidationSchema } from '../server/utils/validators/createUserSchema.js';
import { userLoginValidationSchema } from '../server/utils/validators/userLoginValidationSchema.js';
import { requestNewPasswordSchema } from '../server/utils/validators/requestNewPasswordSchema.js';
import { createTeamInviteSchema } from '../server/utils/validators/createTeamInviteSchema.js';
import { updateMemberRoleSchema } from '../server/utils/validators/updateMemberRoleSchema.js';
import { updatePasswordSchema } from '../server/utils/validators/updatePasswordSchema.js';
import { recoverPasswordSchema } from '../server/utils/validators/recoverPasswordSchema.js';
import { acceptTeamInviteSchema } from '../server/utils/validators/acceptTeamInviteSchema.js';
import { teamInviteTokenQuerySchema } from '../server/utils/validators/teamInviteTokenQuerySchema.js';
import { checkoutSessionSchema } from '../server/utils/validators/checkoutSessionSchema.js';
import { BCRYPT_MAX_PASSWORD_BYTES } from '../server/utils/validators/passwordByteLength.js';

const VALID_TOKEN = 'a'.repeat(43);
const VALID_PASSWORD = 'Password123';
//* 24 three-byte characters + 'Aa1' = 27 characters but 75 bytes
const MULTIBYTE_PASSWORD = `${'€'.repeat(24)}Aa1`;

describe('email fields reject non-string values', () => {
  test.each([
    ['register', createUserValidationSchema, 'username', { password: VALID_PASSWORD }],
    ['login', userLoginValidationSchema, 'username', { password: VALID_PASSWORD }],
    ['password-reset request', requestNewPasswordSchema, 'email', {}],
    ['team invite', createTeamInviteSchema, 'email', { roleName: 'company_member' }],
  ])('%s rejects an array of valid emails', async (_label, schema, field, rest) => {
    const { errors } = await run(schema, { body: { ...rest, [field]: ['a@b.co'] } });

    expect(failedPaths(errors)).toContain(field);
  });

  test('bails after isString so only one error is reported for the field', async () => {
    const { errors } = await run(requestNewPasswordSchema, { body: { email: ['a@b.co'] } });

    expect(errors.filter((error) => error.path === 'email')).toHaveLength(1);
  });

  test('accepts and normalizes a plain string email', async () => {
    const { req, errors } = await run(requestNewPasswordSchema, { body: { email: 'User@Example.com' } });

    expect(errors).toEqual([]);
    expect(req.body.email).toBe('user@example.com');
  });

  test('password-reset request bounds the email length', async () => {
    const { errors } = await run(requestNewPasswordSchema, { body: { email: `${'a'.repeat(250)}@b.co` } });

    expect(failedPaths(errors)).toContain('email');
  });
});

describe('token query fields reject arrays', () => {
  test('invite token given twice in the query string is a 422', async () => {
    const { errors } = await run(teamInviteTokenQuerySchema, { query: { inviteToken: [VALID_TOKEN, VALID_TOKEN] } });

    expect(failedPaths(errors)).toEqual(['inviteToken']);
  });
});

describe('password byte length (bcrypt truncates at 72 bytes)', () => {
  test('the multi-byte fixture is within the character limit but over the byte limit', () => {
    expect(MULTIBYTE_PASSWORD.length).toBeLessThanOrEqual(64);
    expect(Buffer.byteLength(MULTIBYTE_PASSWORD, 'utf8')).toBeGreaterThan(BCRYPT_MAX_PASSWORD_BYTES);
  });

  test.each([
    ['register', createUserValidationSchema, { username: 'a@b.co', password: MULTIBYTE_PASSWORD }, 'password'],
    ['invite accept', acceptTeamInviteSchema, { inviteToken: VALID_TOKEN, password: MULTIBYTE_PASSWORD }, 'password'],
    ['password update', updatePasswordSchema, { currentPassword: 'x', newPassword: MULTIBYTE_PASSWORD }, 'newPassword'],
    ['password recover', recoverPasswordSchema, {
      newPassword: MULTIBYTE_PASSWORD,
      confirmNewPassword: MULTIBYTE_PASSWORD,
      passwordResetToken: VALID_TOKEN,
    }, 'newPassword'],
  ])('%s rejects a password over 72 UTF-8 bytes', async (_label, schema, body, field) => {
    const { errors } = await run(schema, { body });

    expect(failedPaths(errors)).toContain(field);
  });

  test('register accepts an ASCII password within the limits', async () => {
    const { errors } = await run(createUserValidationSchema, { body: { username: 'a@b.co', password: VALID_PASSWORD } });

    expect(errors).toEqual([]);
  });
});

describe('updatePasswordSchema.currentPassword', () => {
  test('rejects a current password over 128 characters', async () => {
    const { errors } = await run(updatePasswordSchema, {
      body: { currentPassword: 'x'.repeat(129), newPassword: VALID_PASSWORD },
    });

    expect(failedPaths(errors)).toEqual(['currentPassword']);
  });

  test('rejects a non-string current password', async () => {
    const { errors } = await run(updatePasswordSchema, {
      body: { currentPassword: ['x'], newPassword: VALID_PASSWORD },
    });

    expect(failedPaths(errors)).toEqual(['currentPassword']);
  });
});

describe('role names', () => {
  test.each([
    ['team invite', createTeamInviteSchema, { email: 'a@b.co' }],
    ['member role update', updateMemberRoleSchema, {}],
  ])('%s rejects an unknown role name with a validation error', async (_label, schema, rest) => {
    const { errors } = await run(schema, { body: { ...rest, roleName: 'company_god' } });

    expect(failedPaths(errors)).toEqual(['roleName']);
  });

  test('role names are no longer escaped', async () => {
    const { req, errors } = await run(updateMemberRoleSchema, { body: { roleName: 'company_admin' } });

    expect(errors).toEqual([]);
    expect(req.body.roleName).toBe('company_admin');
  });

  test('rejects an array role name', async () => {
    const { errors } = await run(updateMemberRoleSchema, { body: { roleName: ['company_admin'] } });

    expect(failedPaths(errors)).toEqual(['roleName']);
  });
});

describe('body schemas read only the JSON body', () => {
  const VALID_EMAIL = 'user@example.com';
  const BODY_SCHEMAS = [
    ['checkout', checkoutSessionSchema, { planName: 'pro', planBillingCycle: 'monthly' }],
    ['register', createUserValidationSchema, { username: VALID_EMAIL, password: VALID_PASSWORD }],
    ['login', userLoginValidationSchema, { username: VALID_EMAIL, password: VALID_PASSWORD }],
    ['password-reset request', requestNewPasswordSchema, { email: VALID_EMAIL }],
    ['password-reset submit', recoverPasswordSchema, {
      newPassword: VALID_PASSWORD,
      confirmNewPassword: VALID_PASSWORD,
      passwordResetToken: VALID_TOKEN,
    }],
    ['password update', updatePasswordSchema, { currentPassword: 'whatever', newPassword: VALID_PASSWORD }],
  ];

  test.each(BODY_SCHEMAS)('%s: values only in the query string are missing', async (_label, schema, values) => {
    const { errors } = await run(schema, { body: {}, query: values });

    expect(failedPaths(errors)).toEqual(expect.arrayContaining(Object.keys(values)));
  });

  test.each(BODY_SCHEMAS)('%s: body values pass and a junk query copy is ignored', async (_label, schema, values) => {
    const junk = Object.fromEntries(Object.keys(values).map((key) => [key, ['junk', 'junk']]));
    const { req, errors } = await run(schema, { body: { ...values }, query: junk });

    expect(errors).toEqual([]);
    expect(req.query).toEqual(junk);
  });

  test('checkout with query-only plan fields fails both fields', async () => {
    const { errors } = await run(checkoutSessionSchema, {
      body: {},
      query: { planName: 'pro', planBillingCycle: 'monthly' },
    });

    expect(failedPaths(errors).sort()).toEqual(['planBillingCycle', 'planName']);
  });
});
