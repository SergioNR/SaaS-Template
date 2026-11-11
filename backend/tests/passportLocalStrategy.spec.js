import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserForLogin: jest.fn(),
}));

const { verifyLocalCredentials } = await import('../server/auth/strategies/passportLocalStrategy.js');
const { getUserForLogin } = await import('../server/models/userModel.js');

const storedHash = await bcrypt.hash('Password123', 4);

const verify = (email, password) => new Promise((resolve) => {
  verifyLocalCredentials(email, password, (err, user, info) => resolve({ err, user, info }));
});

describe('verifyLocalCredentials', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in with the right password and never hands the hash to passport', async () => {
    getUserForLogin.mockResolvedValue({
      id: 'user-1',
      email: 'a@b.co',
      role: 'user',
      company_id: 'company-1',
      email_verified_at: new Date(),
      password: storedHash,
    });

    const { err, user } = await verify('a@b.co', 'Password123');

    expect(err).toBeNull();
    expect(user).toEqual({
      id: 'user-1',
      email: 'a@b.co',
      role: 'user',
      company_id: 'company-1',
    });
    expect(user).not.toHaveProperty('password');
  });

  it('refuses an unverified account with the right password, flagging EMAIL_NOT_VERIFIED', async () => {
    getUserForLogin.mockResolvedValue({ id: 'user-1', email_verified_at: null, password: storedHash });

    const { err, user, info } = await verify('a@b.co', 'Password123');

    expect(err).toBeNull();
    expect(user).toBe(false);
    expect(info).toEqual({ code: 'EMAIL_NOT_VERIFIED' });
  });

  it('answers a plain failure (no verification hint) for a wrong password on an unverified account', async () => {
    getUserForLogin.mockResolvedValue({ id: 'user-1', email_verified_at: null, password: storedHash });

    const { user, info } = await verify('a@b.co', 'WrongPassword1');

    expect(user).toBe(false);
    expect(info).toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    getUserForLogin.mockResolvedValue({ id: 'user-1', password: storedHash });

    const { err, user } = await verify('a@b.co', 'WrongPassword1');

    expect(err).toBeNull();
    expect(user).toBe(false);
  });

  it('rejects an unknown user after comparing against the dummy hash', async () => {
    getUserForLogin.mockResolvedValue(null);
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    const { user } = await verify('nobody@b.co', 'Password123');

    expect(user).toBe(false);
    expect(compareSpy).toHaveBeenCalledTimes(1);
    compareSpy.mockRestore();
  });

  it('forwards lookup failures as errors', async () => {
    getUserForLogin.mockRejectedValue(new Error('db down'));

    const { err } = await verify('a@b.co', 'Password123');

    expect(err).toBeInstanceOf(Error);
  });
});
