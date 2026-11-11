import { paginationQueryFields, searchQueryField } from './listQueryFields.js';
import { buildAdminListFilterRules } from '../adminColumnFilters.js';
import { buildAdminListSortRules } from '../adminColumnSorts.js';

//* Filters (`stripe_linked`, date range) and `sort` / `order` are generated
//* from the admin column registry - add them there, not here
export const adminCompanyListQueryValidationSchema = {
  ...buildAdminListFilterRules('companies'),
  ...buildAdminListSortRules('companies'),
  search: searchQueryField,
  ...paginationQueryFields,
};
