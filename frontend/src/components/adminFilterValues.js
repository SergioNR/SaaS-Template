//* Pure helpers behind AdminFilterPanel and the admin list pages. The filter
//* and sort declarations mirror the backend registry
//* (backend/server/utils/adminColumnFilters.js / adminColumnSorts.js) - the
//* API validates every value and answers 422 on anything else

export const ADMIN_LIST_FILTER_FIELDS = {
  users: [
    { name: 'role', kind: 'select', options: ['user', 'superadmin'] },
    { name: 'company_id', kind: 'text' },
    { name: 'created', kind: 'dateRange' },
    { name: 'last_login', kind: 'dateRange' },
  ],
  companies: [
    { name: 'stripe_linked', kind: 'select', options: ['true', 'false'] },
    { name: 'created', kind: 'dateRange' },
  ],
};

export const ADMIN_LIST_SORT_KEYS = {
  users: ['email', 'last_login_at', 'created_at'],
  companies: ['name', 'created_at'],
};

const SORT_ORDERS = ['asc', 'desc'];

//* The query parameter names a field owns
export const fieldParams = (field) =>
  field.kind === 'dateRange' ? [`${field.name}_from`, `${field.name}_to`] : [field.name];

export const emptyFilterValues = (fields) =>
  Object.fromEntries(fields.flatMap(fieldParams).map((param) => [param, '']));

//* Applied filters as stored in the URL query string - unknown parameters
//* (search, limit, cursor, anything else) are left out
export const filterValuesFromSearchParams = (fields, searchParams) =>
  Object.fromEntries(fields.flatMap(fieldParams).map((param) => [param, searchParams.get(param) ?? '']));

//* Values read from the panel's form elements on apply
export const filterValuesFromForm = (fields, elements) =>
  Object.fromEntries(fields.flatMap(fieldParams).map((param) => [param, String(elements[param]?.value ?? '').trim()]));

//* Only non-empty values become request / URL parameters
export const filterParams = (values) =>
  Object.fromEntries(Object.entries(values).filter(([, value]) => value !== '' && value != null));

//* A date range counts once, whichever bounds are set
export const countActiveFilters = (fields, values) =>
  fields.filter((field) => fieldParams(field).some((param) => values[param])).length;

//* Sort read from the URL - a key outside the list's whitelist is ignored
export const sortFromSearchParams = (list, searchParams) => {
  const sort = searchParams.get('sort');

  if (!ADMIN_LIST_SORT_KEYS[list].includes(sort)) {
    return { sort: null, order: 'asc' };
  }

  const order = searchParams.get('order');

  return { sort, order: SORT_ORDERS.includes(order) ? order : 'asc' };
};

//* Header activation: a new column starts ascending, the active one flips
export const nextSort = (current, key) =>
  current.sort === key ? { sort: key, order: current.order === 'asc' ? 'desc' : 'asc' } : { sort: key, order: 'asc' };

export const ariaSortFor = (current, key) => {
  if (current.sort !== key) {
    return 'none';
  }

  return current.order === 'desc' ? 'descending' : 'ascending';
};

//* Next URL query: filters and sort replace their own parameters, every
//* other parameter is kept
export const mergeListSearchParams = (searchParams, fields, { filters, sort }) => {
  const next = new URLSearchParams(searchParams);

  if (filters) {
    fields.flatMap(fieldParams).forEach((param) => next.delete(param));
    Object.entries(filterParams(filters)).forEach(([param, value]) => next.set(param, value));
  }

  if (sort) {
    next.delete('sort');
    next.delete('order');

    if (sort.sort) {
      next.set('sort', sort.sort);
      next.set('order', sort.order);
    }
  }

  return next;
};

//* Request parameters for one list page
export const listRequestParams = ({ filters, sort }) => ({
  ...filterParams(filters),
  ...(sort.sort ? { sort: sort.sort, order: sort.order } : {}),
});
