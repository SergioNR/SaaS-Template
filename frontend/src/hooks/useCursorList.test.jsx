import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useCursorList } from './useCursorList.js';

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

const page = (ids, nextCursor = null) => ({
  items: ids.map((id) => ({ id })),
  itemCount: ids.length,
  nextCursor,
});

const renderList = (initialFetchPage, onLoadMoreError) =>
  renderHook(
    ({ fetchPage }) => useCursorList({ fetchPage, rowsKey: 'items', countKey: 'itemCount', onLoadMoreError }),
    {
      initialProps: { fetchPage: initialFetchPage },
    },
  );

describe('useCursorList', () => {
  it('loads the first page on mount', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page([1, 2], 'c2'));

    const { result } = renderList(fetchPage);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.current.rowCount).toBe(2);
    expect(result.current.nextCursor).toBe('c2');
    expect(fetchPage).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('discards a stale first page that resolves after newer params', async () => {
    const stale = deferred();
    const staleFetch = vi.fn().mockReturnValue(stale.promise);
    const freshFetch = vi.fn().mockResolvedValue(page([10]));

    const { result, rerender } = renderList(staleFetch);
    const staleSignal = staleFetch.mock.calls[0][0].signal;

    rerender({ fetchPage: freshFetch });
    await waitFor(() => expect(result.current.loading).toBe(false));

    //* The old request was aborted, and even if it resolves it is ignored
    expect(staleSignal.aborted).toBe(true);

    await act(async () => {
      stale.resolve(page([1, 2, 3]));
      await stale.promise;
    });

    expect(result.current.rows).toEqual([{ id: 10 }]);
    expect(result.current.error).toBe(false);
  });

  it('does not flag an error when a stale first page fails', async () => {
    const stale = deferred();
    const staleFetch = vi.fn().mockReturnValue(stale.promise);
    const freshFetch = vi.fn().mockResolvedValue(page([10]));

    const { result, rerender } = renderList(staleFetch);

    rerender({ fetchPage: freshFetch });
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      stale.reject(new Error('aborted'));
      await stale.promise.catch(() => {});
    });

    expect(result.current.error).toBe(false);
    expect(result.current.rows).toEqual([{ id: 10 }]);
  });

  it('discards a load-more page that resolves after a reload', async () => {
    const more = deferred();
    const onLoadMoreError = vi.fn();
    const fetchPage = vi.fn(({ cursor }) => (cursor ? more.promise : Promise.resolve(page([1], 'c2'))));

    const { result } = renderList(fetchPage, onLoadMoreError);

    await waitFor(() => expect(result.current.loading).toBe(false));

    let loadMorePromise;
    act(() => {
      loadMorePromise = result.current.loadMore();
    });

    await act(async () => {
      await result.current.reload();
    });

    await act(async () => {
      more.resolve(page([2, 3]));
      await loadMorePromise;
    });

    expect(result.current.rows).toEqual([{ id: 1 }]);
    expect(onLoadMoreError).not.toHaveBeenCalled();
  });

  it('appends the next page and reports load-more failures', async () => {
    const onLoadMoreError = vi.fn();
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce(page([1], 'c2'))
      .mockResolvedValueOnce(page([2], 'c3'))
      .mockRejectedValueOnce(new Error('network'));

    const { result } = renderList(fetchPage, onLoadMoreError);

    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.rows).toEqual([{ id: 1 }, { id: 2 }]);
    expect(fetchPage).toHaveBeenLastCalledWith({ cursor: 'c2', signal: expect.any(AbortSignal) });

    await act(async () => {
      await result.current.loadMore();
    });

    expect(onLoadMoreError).toHaveBeenCalledTimes(1);
    expect(result.current.rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('flags an error when the current first page fails', async () => {
    const fetchPage = vi.fn().mockRejectedValue(new Error('500'));

    const { result } = renderList(fetchPage);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(true);
    expect(result.current.errorStatus).toBeNull();
  });

  it('exposes the HTTP status of a failed first page (422 = rejected filters)', async () => {
    const fetchPage = vi.fn().mockRejectedValue({ response: { status: 422 } });

    const { result } = renderList(fetchPage);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.errorStatus).toBe(422);
  });
});
