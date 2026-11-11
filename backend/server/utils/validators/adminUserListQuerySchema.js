import { paginationQueryFields, searchQueryField } from './listQueryFields.js';
import { buildAdminListFilterRules } from '../adminColumnFilters.js';
import { buildAdminListSortRules } from '../adminColumnSorts.js';

//* Filters (`role`, `company_id`, date ranges) and `sort` / `order` are
//* generated from the admin column registry - add them there, not here
export const adminUserListQueryValidationSchema = {
  ...buildAdminListFilterRules('users'),
  ...buildAdminListSortRules('users'),
  search: searchQueryField,
  ...paginationQueryFields,
};
