//* Declarative filter registry of the admin lists - the ONLY place an admin
//* list filter is added. One declaration per filter generates the three
//* things that must agree: the Prisma `where` fragment, the express-validator
//* rules (pinned to the query string) and the OpenAPI query parameters.
//* Types: `enum` (one of `values`), `ref` (UUID), `boolean` (`true`/`false`,
//* mapped by `whereFor`), `dateRange` (`<param>_from` / `<param>_to`, ISO
//* dates, inclusive UTC days, either bound alone)

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ADMIN_LIST_FILTERS = {
  users: [
    {
      param: 'role',
      type: 'enum',
      field: 'role',
      values: ['user', 'superadmin'],
      errorMessage: 'Role filter must be one of: user, superadmin',
      description: 'Only users with this platform role',
    },
    {
      param: 'company_id',
      type: 'ref',
      field: 'company_id',
      description: 'Only members of this company',
    },
    {
      param: 'created',
      type: 'dateRange',
      field: 'created_at',
      description: 'account creation day',
    },
    {
      param: 'last_login',
      type: 'dateRange',
      field: 'last_login_at',
      description: 'last login day (users who never logged in never match a bound)',
    },
  ],
  companies: [
    {
      param: 'stripe_linked',
      type: 'boolean',
      field: 'stripe_id',
      //* The Stripe id itself never leaves the API - only whether it is set
      whereFor: (linked) => ({ stripe_id: linked ? { not: null } : null }),
      description: 'Only companies with (`true`) or without (`false`) a Stripe customer',
    },
    {
      param: 'created',
      type: 'dateRange',
      field: 'created_at',
      description: 'company creation day',
    },
  ],
};

const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  //* Rejects 2026-02-30 (Date would roll it over to March)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const startOfUtcDay = (value) => new Date(`${value}T00:00:00.000Z`);

const getList = (list) => {
  const filters = ADMIN_LIST_FILTERS[list];

  if (!filters) {
    throw new Error(`Unknown admin list "${list}"`);
  }

  return filters;
};

//* The query parameter names a filter owns
export const filterQueryParams = (filter) => (filter.type === 'dateRange'
  ? [`${filter.param}_from`, `${filter.param}_to`]
  : [filter.param]);

//* (1) Prisma `where` fragment for the active filters of `query` (already
//* validated). Each filter targets its own column, so the fragments merge
//* into one flat object the caller combines with its search clause
export const buildAdminListWhere = (list, query = {}) => getList(list).reduce((where, filter) => {
  if (filter.type === 'dateRange') {
    const from = query[`${filter.param}_from`];
    const to = query[`${filter.param}_to`];

    if (!from && !to) {
      return where;
    }

    const range = {};

    if (from) range.gte = startOfUtcDay(from);
    //* Inclusive upper day: everything before the next day's midnight
    if (to) range.lt = new Date(startOfUtcDay(to).getTime() + DAY_MS);

    return { ...where, [filter.field]: range };
  }

  const value = query[filter.param];

  if (value === undefined || value === '') {
    return where;
  }

  if (filter.type === 'boolean') {
    return { ...where, ...filter.whereFor(value === 'true') };
  }

  return { ...where, [filter.field]: value };
}, {});

//* (2) express-validator rules, spread into the list's checkSchema schema
export const buildAdminListFilterRules = (list) => Object.fromEntries(getList(list).flatMap((filter) => {
  switch (filter.type) {
    case 'enum':
      return [[filter.param, {
        in: ['query'],
        optional: true,
        isIn: {
          options: [filter.values],
          errorMessage: filter.errorMessage ?? `${filter.param} must be one of: ${filter.values.join(', ')}`,
        },
      }]];
    case 'ref':
      return [[filter.param, {
        in: ['query'],
        optional: true,
        isUUID: {
          errorMessage: `${filter.param} must be a valid UUID`,
        },
      }]];
    case 'boolean':
      return [[filter.param, {
        in: ['query'],
        optional: true,
        isIn: {
          options: [['true', 'false']],
          errorMessage: `${filter.param} must be true or false`,
        },
      }]];
    case 'dateRange': {
      const fromParam = `${filter.param}_from`;
      const toParam = `${filter.param}_to`;
      const dateRule = (param) => ({
        in: ['query'],
        optional: true,
        custom: {
          options: isValidDate,
          errorMessage: `${param} must be a date (YYYY-MM-DD)`,
        },
      });

      return [
        [fromParam, dateRule(fromParam)],
        [toParam, {
          ...dateRule(toParam),
          isAfterRangeStart: {
            custom: (value, { req }) => {
              const from = req.query?.[fromParam];

              //* Malformed bounds are reported by their own rule
              return !isValidDate(from) || !isValidDate(value) || from <= value;
            },
            errorMessage: `${toParam} must not be before ${fromParam}`,
          },
        }],
      ];
    }
    default:
      throw new Error(`Unknown admin filter type "${filter.type}"`);
  }
}));

//* (3) OpenAPI query parameters, appended to the list operation by
//* config/swagger.js
export const buildAdminListFilterParameters = (list) => getList(list).flatMap((filter) => {
  switch (filter.type) {
    case 'enum':
      return [{
        in: 'query', name: filter.param, required: false, schema: { type: 'string', enum: filter.values }, description: filter.description,
      }];
    case 'ref':
      return [{
        in: 'query', name: filter.param, required: false, schema: { type: 'string', format: 'uuid' }, description: filter.description,
      }];
    case 'boolean':
      return [{
        in: 'query', name: filter.param, required: false, schema: { type: 'string', enum: ['true', 'false'] }, description: filter.description,
      }];
    case 'dateRange':
      return [
        {
          in: 'query', name: `${filter.param}_from`, required: false, schema: { type: 'string', format: 'date' }, description: `Inclusive lower bound (UTC day) of the ${filter.description}`,
        },
        {
          in: 'query', name: `${filter.param}_to`, required: false, schema: { type: 'string', format: 'date' }, description: `Inclusive upper bound (UTC day) of the ${filter.description}; must not be before \`${filter.param}_from\``,
        },
      ];
    default:
      throw new Error(`Unknown admin filter type "${filter.type}"`);
  }
});
