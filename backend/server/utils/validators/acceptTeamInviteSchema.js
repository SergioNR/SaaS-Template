import { SECURE_TOKEN_PATTERN } from '../secureToken.js';
import { passwordByteLengthValidator } from './passwordByteLength.js';

export const acceptTeamInviteSchema = {
  inviteToken: {
    in: ['body'],
    isString: {
      errorMessage: 'Team invite token must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Team invite token is required',
    },
    matches: {
      options: SECURE_TOKEN_PATTERN,
      errorMessage: 'Team invite token is malformed',
    },
  },
  password: {
    in: ['body'],
    isString: {
      errorMessage: 'Password must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Password is required',
    },
    isLength: {
      options: {
        min: 8,
        max: 64,
      },
      errorMessage: 'Password must be between 8-64 characters long',
    },
    isWithinBcryptByteLimit: passwordByteLengthValidator,
    //* Same strength rules as self-registration
    isStrongPassword: {
      options: {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 0,
      },
      errorMessage: 'Password must contain at least one lowercase letter, one uppercase letter and one number',
    },
  },
};
