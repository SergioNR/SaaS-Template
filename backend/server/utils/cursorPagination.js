const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

//* The newest-first order every cursor-paginated list keeps. The row id
//* tiebreaker makes the total order deterministic when created_at collides,
//* which the cursor walk needs: Prisma resolves its cursor position through
//* the query's orderBy
export const DEFAULT_LIST_ORDER = [
  { created_at: 'desc' },
  { id: 'desc' },
];

//* Shared cursor-pagination contract for every list endpoint (admin, files) -
//* the same rules the LimitQuery/CursorQuery swagger components document.
//* One implementation so the documented contract cannot drift
export const parsePagination = (query = {}) => ({
  limit: Math.min(Number.parseInt(query.limit, 10) || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  cursor: typeof query.cursor === 'string' && query.cursor.length > 0
    ? query.cursor
    : undefined,
});

//* A full page may have a successor - its last row id is the next cursor.
//* A short (or empty) page is the last one
export const computeNextCursor = (rows, limit) => (
  rows.length === limit && rows.length > 0
    ? rows[rows.length - 1].id
    : undefined
);

//* The findMany argument block every cursor-paginated list shares - newest
//* first with the row id as tiebreaker, one row skipped after the cursor.
//* One builder so the walk cannot drift between models
export const listPaginationArgs = (pagination = {}, orderBy = DEFAULT_LIST_ORDER) => ({
  orderBy: orderBy,
  take: pagination.limit,
  skip: pagination.cursor ? 1 : undefined,
  cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
});

//* Keyset condition for "rows after the cursor row" under a sort spec -
//* explicit instead of Prisma's `cursor`, whose position lookup compares
//* against the cursor row's value and cannot place rows around a NULL.
//* Mirrors the sort spec's orderBy (utils/adminColumnSorts.js): values in
//* `direction`, nulls last, id tiebreaker in the same direction
export const buildKeysetWhere = (sort, cursorRow) => {
  const after = sort.direction === 'asc' ? 'gt' : 'lt';
  const value = cursorRow[sort.field];
  const idAfter = { id: { [after]: cursorRow.id } };

  if (value === null || value === undefined) {
    //* Already in the null tail: only later nulls follow
    return { AND: [{ [sort.field]: null }, idAfter] };
  }

  const branches = [
    { [sort.field]: { [after]: value } },
    { AND: [{ [sort.field]: value }, idAfter] },
  ];

  if (sort.nullable) {
    branches.push({ [sort.field]: null });
  }

  return { OR: branches };
};

//* The findMany arguments of a list page: the default order keeps Prisma's
//* `cursor` (listPaginationArgs); an explicit sort spec walks by keyset after
//* the cursor row, which `findCursorRow(cursorId)` reads (`id` + the sort
//* field). The cursor stays the previous page's last row id either way.
//* Resolves to null when the cursor row no longer exists - there is nothing
//* to continue from
export const resolveListQueryArgs = async (where, pagination = {}, sort = null, findCursorRow = null) => {
  if (!sort) {
    return { where, ...listPaginationArgs(pagination) };
  }

  const sortedArgs = { orderBy: sort.orderBy, take: pagination.limit };

  if (!pagination.cursor) {
    return { where, ...sortedArgs };
  }

  const cursorRow = await findCursorRow(pagination.cursor);

  if (!cursorRow) {
    return null;
  }

  return { where: { AND: [where, buildKeysetWhere(sort, cursorRow)] }, ...sortedArgs };
};
