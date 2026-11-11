import { SECURE_TOKEN_PATTERN } from '../secureToken.js';
import { passwordByteLengthValidator } from './passwordByteLength.js';

export const recoverPasswordSchema = {
  newPassword: {
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
    custom: {
      options: (value, { req }) => value === req.body.confirmNewPassword,
      errorMessage: 'Passwords do not match',
    },
  },
  confirmNewPassword: {
    in: ['body'],
    isString: {
      errorMessage: 'Password confirmation must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Password confirmation is required',
    },
    isLength: {
      options: {
        min: 8,
        max: 64,
      },
      errorMessage: 'Password must be between 8-64 characters long',
    },
  },
  passwordResetToken: {
    in: ['body'],
    isString: {
      errorMessage: 'Password reset token must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Password reset token is required',
    },
    matches: {
      options: SECURE_TOKEN_PATTERN,
      errorMessage: 'Password reset token is malformed',
    },
  },
};
