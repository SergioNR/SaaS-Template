import { SECURE_TOKEN_PATTERN } from '../secureToken.js';

export const teamInviteTokenQuerySchema = {
  inviteToken: {
    in: ['query'],
    //* `?token=a&token=b` arrives as an array
    isString: {
      errorMessage: 'Token must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Token is required',
    },
    matches: {
      options: SECURE_TOKEN_PATTERN,
      errorMessage: 'Team invite token is malformed',
    },
  },
};
