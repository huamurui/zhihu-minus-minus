import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseEndReachedPaginationOptions {
  /** Whether the list or host screen is currently active. */
  isActive: boolean;
  /** Whether there is a subsequent page to fetch according to the query. */
  hasNextPage: boolean;
  /** Whether the next page request is in an error state. */
  isFetchNextPageError: boolean;
  /** Whether any query operation is in flight (fetching, refreshing, or loading). */
  isBusy: boolean;
  /**
   * The current cursor or page identifier (e.g. nextUrl or page count).
   * Changes whenever a new page arrives or when data is reset.
   */
  cursor: string | number | null | undefined;
  /**
   * Callback to fetch the next page.
   * May return a result object indicating whether the fetch actually started.
   */
  onFetchNextPage: () => Promise<unknown> | unknown;
  /** Whether custom auto-filling (e.g. low card count under filter) is active. */
  isAutoFetching?: boolean;
}

export interface UseEndReachedPaginationResult {
  /** FlashList onEndReached callback. */
  handleEndReached: () => void;
  /**
   * Whether an end-reached pagination intent is waiting because the query was
   * temporarily occupied by another in-flight operation.
   */
  isPendingIntent: boolean;
  /** Explicitly cancel any pending pagination intent (e.g. on user refresh). */
  cancelPendingIntent: () => void;
}

export function useEndReachedPagination({
  isActive,
  hasNextPage,
  isFetchNextPageError,
  isBusy,
  cursor,
  onFetchNextPage,
  isAutoFetching = false,
}: UseEndReachedPaginationOptions): UseEndReachedPaginationResult {
  const pendingIntentRef = useRef<{
    cursor: string | number | null | undefined;
  } | null>(null);
  const [isPendingIntent, setIsPendingIntent] = useState(false);

  const cancelPendingIntent = useCallback(() => {
    pendingIntentRef.current = null;
    setIsPendingIntent(false);
  }, []);

  const handleEndReached = useCallback(() => {
    if (!isActive || !hasNextPage || isFetchNextPageError || isAutoFetching) {
      return;
    }
    if (cursor === undefined || cursor === null) {
      return;
    }

    if (isBusy) {
      pendingIntentRef.current = { cursor };
      setIsPendingIntent(true);
      return;
    }

    void (async () => {
      try {
        const result = await onFetchNextPage();
        if (
          result &&
          typeof result === 'object' &&
          'status' in result &&
          result.status === 'blocked'
        ) {
          pendingIntentRef.current = { cursor };
          setIsPendingIntent(true);
        } else {
          pendingIntentRef.current = null;
          setIsPendingIntent(false);
        }
      } catch {
        pendingIntentRef.current = null;
        setIsPendingIntent(false);
      }
    })();
  }, [
    cursor,
    hasNextPage,
    isActive,
    isAutoFetching,
    isBusy,
    isFetchNextPageError,
    onFetchNextPage,
  ]);

  // When blocking conditions recover, dispatch the pending intent at most once.
  useEffect(() => {
    if (!isActive) {
      if (pendingIntentRef.current !== null) {
        pendingIntentRef.current = null;
        setIsPendingIntent(false);
      }
      return;
    }

    const pending = pendingIntentRef.current;
    if (!pending) return;

    // Cursor changed (e.g. refreshed or new data arrived) -> cancel expired intent.
    if (pending.cursor !== cursor) {
      pendingIntentRef.current = null;
      setIsPendingIntent(false);
      return;
    }

    // Wait if still busy or if query errored or has no more pages.
    if (isBusy || isFetchNextPageError || !hasNextPage) {
      return;
    }

    pendingIntentRef.current = null;
    setIsPendingIntent(false);
    void onFetchNextPage();
  }, [
    cursor,
    hasNextPage,
    isActive,
    isBusy,
    isFetchNextPageError,
    onFetchNextPage,
  ]);

  return {
    handleEndReached,
    isPendingIntent,
    cancelPendingIntent,
  };
}
