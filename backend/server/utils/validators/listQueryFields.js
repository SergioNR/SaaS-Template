//* Shared validation rules for the generic list-query fields (search, limit,
//* cursor) - the same shapes the SearchQuery/LimitQuery/CursorQuery swagger
//* components document. List schemas spread these and keep their
//* entity-specific fields (e.g. `role`) local

export const searchQueryField = {
  optional: true,
  isString: {
    errorMessage: 'Search term must be a string',
  },
  trim: true,
  isLength: {
    options: {
      max: 100,
    },
    errorMessage: 'Search term must not exceed 100 characters',
  },
};

export const limitQueryField = {
  optional: true,
  isInt: {
    options: {
      min: 1,
      max: 100,
    },
    errorMessage: 'Limit must be an integer between 1 and 100',
  },
};

export const cursorQueryField = {
  optional: true,
  isUUID: {
    errorMessage: 'Cursor must be a valid UUID',
  },
};

//* Spread into every cursor-paginated list schema
export const paginationQueryFields = {
  limit: limitQueryField,
  cursor: cursorQueryField,
};
