import LocalStrategy from 'passport-local';
import bcrypt from 'bcryptjs';
import { getUserForLogin } from '../../models/userModel.js';
import { BCRYPT_SALT_ROUNDS } from '../../config/security.js';

//* Constant invalid hash used to equalize response times for nonexistent users,
//* preventing user enumeration through login response timing
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync('timing-attack-mitigation-dummy-hash', BCRYPT_SALT_ROUNDS);

export const verifyLocalCredentials = async (userEmail, password, done) => {
  try {
    const user = await getUserForLogin(userEmail);

    if (!user) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      return done(null, false);
    }

    const { password: passwordHash, ...userWithoutPassword } = user;

    const passwordMatches = await bcrypt.compare(password, passwordHash);

    if (!passwordMatches) {
      return done(null, false);
    }

    //* The hash never travels past the strategy
    return done(null, userWithoutPassword);
  } catch (err) {
    return done(err);
  }
};

export const localStrategy = new LocalStrategy(verifyLocalCredentials);
