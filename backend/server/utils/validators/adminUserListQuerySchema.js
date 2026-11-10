import { paginationQueryFields, searchQueryField } from './listQueryFields.js';

export const adminUserListQueryValidationSchema = {
  role: {
    in: ['query'],
    optional: true,
    isIn: {
      options: [['user', 'superadmin']],
      errorMessage: 'Role filter must be one of: user, superadmin',
    },
  },
  search: searchQueryField,
  ...paginationQueryFields,
};
