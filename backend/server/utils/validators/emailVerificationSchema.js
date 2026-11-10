import { SECURE_TOKEN_PATTERN } from '../secureToken.js';

//* Body only - the token never travels in the query of an API request
export const emailVerificationSchema = {
  emailVerificationToken: {
    in: ['body'],
    isString: {
      errorMessage: 'Email verification token must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Email verification token is required',
    },
    matches: {
      options: SECURE_TOKEN_PATTERN,
      errorMessage: 'Email verification token is malformed',
    },
  },
};
