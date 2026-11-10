import { COMPANY_ROLE_RANK } from '../companyRoleHierarchy.js';

export const updateMemberRoleSchema = {
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
