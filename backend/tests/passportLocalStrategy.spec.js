import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';

jest.unstable_mockModule('../server/models/userModel.js', () => ({
  getUserForLogin: jest.fn(),
}));

const { verifyLocalCredentials } = await import('../server/auth/strategies/passportLocalStrategy.js');
const { getUserForLogin } = await import('../server/models/userModel.js');

const storedHash = await bcrypt.hash('Password123', 4);

const verify = (email, password) => new Promise((resolve) => {
  verifyLocalCredentials(email, password, (err, user) => resolve({ err, user }));
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
