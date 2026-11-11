import { passwordByteLengthValidator } from './passwordByteLength.js';

export const updatePasswordSchema = {
  currentPassword: {
    in: ['body'],
    isString: {
      errorMessage: 'Current password must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Current password is required',
    },
    //* Same ceiling as login - bounds what bcrypt.compare is asked to hash
    isLength: {
      options: { max: 128 },
      errorMessage: 'Current password must not exceed 128 characters',
    },
  },
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
  },
};
