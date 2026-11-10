import {
  DEFAULT_LIST_ORDER,
  computeNextCursor,
  listPaginationArgs,
  parsePagination,
} from '../server/utils/cursorPagination.js';

describe('parsePagination', () => {
  it('defaults to a page size of 50 with no cursor', () => {
    expect(parsePagination({})).toEqual({ limit: 50, cursor: undefined });
    expect(parsePagination()).toEqual({ limit: 50, cursor: undefined });
  });

  it('caps the limit at 100 and keeps a non-empty string cursor', () => {
    expect(parsePagination({ limit: '500', cursor: 'cursor-id' })).toEqual({ limit: 100, cursor: 'cursor-id' });
  });

  it('drops an empty-string or non-string cursor', () => {
    expect(parsePagination({ cursor: '' })).toEqual({ limit: 50, cursor: undefined });
    expect(parsePagination({ cursor: ['a', 'b'] })).toEqual({ limit: 50, cursor: undefined });
  });

  it('falls back to the default when limit is not a number', () => {
    expect(parsePagination({ limit: 'abc' }).limit).toBe(50);
  });
});

describe('computeNextCursor', () => {
  it('returns the last row id only when the page is full', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];

    expect(computeNextCursor(rows, 2)).toBe('b');
    expect(computeNextCursor(rows, 5)).toBeUndefined();
  });

  it('returns undefined for an empty page', () => {
    expect(computeNextCursor([], 50)).toBeUndefined();
  });
});

describe('listPaginationArgs', () => {
  it('orders newest first with the id tiebreaker', () => {
    expect(DEFAULT_LIST_ORDER).toEqual([{ created_at: 'desc' }, { id: 'desc' }]);
    expect(listPaginationArgs({ limit: 10 })).toEqual({
      orderBy: DEFAULT_LIST_ORDER,
      take: 10,
      skip: undefined,
      cursor: undefined,
    });
  });

  it('skips the cursor row itself', () => {
    expect(listPaginationArgs({ limit: 10, cursor: 'row-9' })).toEqual({
      orderBy: DEFAULT_LIST_ORDER,
      take: 10,
      skip: 1,
      cursor: { id: 'row-9' },
    });
  });
});
