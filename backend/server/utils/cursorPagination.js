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
export const listPaginationArgs = (pagination = {}) => ({
  orderBy: DEFAULT_LIST_ORDER,
  take: pagination.limit,
  skip: pagination.cursor ? 1 : undefined,
  cursor: pagination.cursor ? { id: pagination.cursor } : undefined,
});
