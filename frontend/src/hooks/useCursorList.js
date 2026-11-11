import { useCallback, useEffect, useRef, useState } from 'react';

//* Shared state for cursor-paginated lists (admin users, admin companies):
//* every first-page load (param change, reload) bumps a request id and aborts
//* the previous request, so late responses for stale params - first pages or
//* load-more pages - are discarded instead of mixed into the list.
//* `fetchPage` is a stable callback built around the page's own params
//* ({ cursor, signal } -> response body with [rowsKey], [countKey] and
//* nextCursor); changing it reloads the first page. `reload` lets a page
//* refresh itself after an action (delete, edit)
export function useCursorList({ fetchPage, rowsKey, countKey, onLoadMoreError }) {
  const [rows, setRows] = useState([]);
  const [rowCount, setRowCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  //* HTTP status of the failed first page (422 = rejected filters/sort)
  const [errorStatus, setErrorStatus] = useState(null);

  const requestIdRef = useRef(0);
  const abortRef = useRef(null);
  const loadingMoreRef = useRef(false);
  //* Read through a ref so an inline callback does not re-create loadMore
  const onLoadMoreErrorRef = useRef(onLoadMoreError);

  useEffect(() => {
    onLoadMoreErrorRef.current = onLoadMoreError;
  }, [onLoadMoreError]);

  const loadFirstPage = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError(false);
    setErrorStatus(null);
    setNextCursor(null);

    try {
      const data = await fetchPage({ signal: controller.signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRows(data[rowsKey] ?? []);
      setRowCount(data[countKey] ?? 0);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      if (requestId === requestIdRef.current) {
        setError(true);
        setErrorStatus(err?.response?.status ?? null);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetchPage, rowsKey, countKey]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) {
      return;
    }

    const requestId = requestIdRef.current;
    const signal = abortRef.current?.signal;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const data = await fetchPage({ cursor: nextCursor, signal });

      if (requestId !== requestIdRef.current) {
        return;
      }

      setRows((previousRows) => [...previousRows, ...(data[rowsKey] ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      if (requestId === requestIdRef.current) {
        onLoadMoreErrorRef.current?.();
      }
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, nextCursor, rowsKey]);

  return {
    rows,
    rowCount,
    nextCursor,
    loading,
    loadingMore,
    error,
    errorStatus,
    reload: loadFirstPage,
    loadMore,
  };
}

export default useCursorList;
