import { COMPANY_ROLE_RANK } from '../companyRoleHierarchy.js';

export const createTeamInviteSchema = {
  email: {
    in: ['body'],
    //* First and bailing: `["a@b.co"]` would otherwise pass isEmail per
    //* element and reach Prisma as an array
    isString: {
      errorMessage: 'Email must be a string',
      bail: true,
    },
    notEmpty: {
      errorMessage: 'Email is required',
    },
    isEmail: {
      errorMessage: 'Please enter a valid email address',
      bail: true,
    },
    normalizeEmail: {
      options: {
        lowercase: true,
        gmail_remove_dots: true,
        gmail_remove_subaddress: true,
        gmail_convert_googlemaildotcom: true,
        outlookdotcom_remove_subaddress: true,
        yahoo_remove_subaddress: true,
        icloud_remove_subaddress: true,
      },
    },
    isLength: {
      options: {
        max: 254,
        min: 3,
      },
      errorMessage: 'Email must not exceed 254 characters',
    },
  },
  roleName: {
    in: ['body'],
    notEmpty: {
      errorMessage: 'Role name is required',
    },
    isString: {
      errorMessage: 'Role name must be a string',
      bail: true,
    },
    isIn: {
      options: [Object.keys(COMPANY_ROLE_RANK)],
      //* A bogus role is a validation problem (422), not a missing row - the
      //* swagger schemas document the enum
      errorMessage: 'Role name must be one of the company roles',
    },
  },
};
