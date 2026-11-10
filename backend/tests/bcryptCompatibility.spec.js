import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserForLogin: jest.fn(),
}));

const { DUMMY_PASSWORD_HASH } = await import('../server/auth/strategies/passportLocalStrategy.js');
const { BCRYPT_SALT_ROUNDS } = await import('../server/config/security.js');

//* Published bcrypt test vector (password "U*U") in the `$2a$` format that
//* bcryptjs wrote for every existing account
const LEGACY_2A_HASH = '$2a$05$CCCCCCCCCCCCCCCCCCCCC.E5YPO9kmyuRGyh0XouQYb4YMJKvyOeW';

describe('native bcrypt replaces bcryptjs without invalidating stored hashes', () => {
  it('still verifies $2a$ hashes written by bcryptjs', async () => {
    await expect(bcrypt.compare('U*U', LEGACY_2A_HASH)).resolves.toBe(true);
    await expect(bcrypt.compare('U*V', LEGACY_2A_HASH)).resolves.toBe(false);
  });

  it('keeps the cost at 12', () => {
    expect(BCRYPT_SALT_ROUNDS).toBe(12);
    expect(bcrypt.getRounds(DUMMY_PASSWORD_HASH)).toBe(12);
  });

  it('builds a valid dummy hash for timing equalisation', async () => {
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[ab]\$12\$/);
    await expect(bcrypt.compare('timing-attack-mitigation-dummy-hash', DUMMY_PASSWORD_HASH)).resolves.toBe(true);
    await expect(bcrypt.compare('Password123', DUMMY_PASSWORD_HASH)).resolves.toBe(false);
  });
});
