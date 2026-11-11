//* Sort whitelist of the admin lists - the ONLY place an admin list sort is
//* added. `nullable` columns sort their nulls last in both directions, and
//* the row id is always the same-direction tiebreaker so the order is total
//* (the cursor walk needs that - see buildKeysetWhere in
//* utils/cursorPagination.js). Without `sort` the lists keep
//* DEFAULT_LIST_ORDER (utils/cursorPagination.js, newest first)
export const ADMIN_LIST_SORTS = {
  users: {
    email: { field: 'email' },
    created_at: { field: 'created_at' },
    last_login_at: { field: 'last_login_at', nullable: true },
  },
  companies: {
    name: { field: 'name', nullable: true },
    created_at: { field: 'created_at' },
  },
};

export const SORT_ORDERS = ['asc', 'desc'];
export const DEFAULT_SORT_ORDER = 'asc';

const getSorts = (list) => {
  const sorts = ADMIN_LIST_SORTS[list];

  if (!sorts) {
    throw new Error(`Unknown admin list "${list}"`);
  }

  return sorts;
};

//* Resolves the validated `sort` / `order` query into the list's sort spec,
//* or null for the default order. Throws on a key outside the whitelist
//* (the validator answers 422 before this runs)
export const buildAdminListSort = (list, sortKey, order = DEFAULT_SORT_ORDER) => {
  if (sortKey === undefined || sortKey === null || sortKey === '') {
    return null;
  }

  const sort = getSorts(list)[sortKey];

  if (!sort) {
    throw new Error(`Unknown sort "${sortKey}" for admin list "${list}"`);
  }

  const direction = SORT_ORDERS.includes(order) ? order : DEFAULT_SORT_ORDER;

  return {
    key: sortKey,
    field: sort.field,
    nullable: Boolean(sort.nullable),
    direction: direction,
    orderBy: [
      { [sort.field]: sort.nullable ? { sort: direction, nulls: 'last' } : direction },
      { id: direction },
    ],
  };
};

//* express-validator rules for `sort` / `order`, spread into the list schema
export const buildAdminListSortRules = (list) => {
  const keys = Object.keys(getSorts(list));

  return {
    sort: {
      in: ['query'],
      optional: true,
      isIn: {
        options: [keys],
        errorMessage: `Sort must be one of: ${keys.join(', ')}`,
      },
    },
    order: {
      in: ['query'],
      optional: true,
      isIn: {
        options: [SORT_ORDERS],
        errorMessage: 'Order must be asc or desc',
      },
    },
  };
};

export const buildAdminListSortParameters = (list) => [
  {
    in: 'query',
    name: 'sort',
    required: false,
    schema: { type: 'string', enum: Object.keys(getSorts(list)) },
    description: 'Sort column (row id as same-direction tiebreaker; empty values last). Without it the list is newest first. Any other value answers 422',
  },
  {
    in: 'query',
    name: 'order',
    required: false,
    schema: { type: 'string', enum: SORT_ORDERS, default: DEFAULT_SORT_ORDER },
    description: 'Sort direction, used with `sort`',
  },
];
