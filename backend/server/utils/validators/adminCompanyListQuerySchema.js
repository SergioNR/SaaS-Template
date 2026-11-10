import { paginationQueryFields, searchQueryField } from './listQueryFields.js';

export const adminCompanyListQueryValidationSchema = {
  search: searchQueryField,
  ...paginationQueryFields,
};
