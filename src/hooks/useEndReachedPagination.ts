import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

/** Follow-up loads allowed while the list rests at one scroll offset in end zone. */
export const MAX_RESTING_FOLLOW_UPS = 3;

export interface EndGeometry {
  getAbsoluteLastScrollOffset?: () => number;
  getWindowSize?: () => { height: number; width?: number };
  getChildContainerDimensions?: () => { height: number; width?: number };
  getFirstItemOffset?: () => number;
}

/**
 * FlashList's onEndReached condition evaluated against current layout geometry.
 */
export function isNearEnd(list: EndGeometry, threshold = 0.5): boolean {
  const offset = list.getAbsoluteLastScrollOffset?.() ?? 0;
  const windowSize = list.getWindowSize?.();
  const visible = windowSize?.height ?? 0;
  const childContainer = list.getChildContainerDimensions?.();
  const firstItemOffset = list.getFirstItemOffset?.() ?? 0;
  const content = (childContainer?.height ?? 0) + firstItemOffset;
  if (visible <= 0 || content <= 0) return false;
  return Math.ceil(offset + visible) >= content - threshold * visible;
}

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
  /** Current count of visible/rendered items. Used to detect if paging yielded new content. */
  itemCount?: number;
  /** Whether custom auto-filling (e.g. low card count under filter) is active. */
  isAutoFetching?: boolean;
  /** Optional FlashList ref to inspect geometry when settling at end. */
  listRef?: RefObject<EndGeometry | null>;
  /** Threshold for near-end calculation. Defaults to 0.5. */
  endReachedThreshold?: number;
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
  itemCount,
  isAutoFetching = false,
  listRef,
  endReachedThreshold = 0.5,
}: UseEndReachedPaginationOptions): UseEndReachedPaginationResult {
  const pendingIntentRef = useRef<{
    cursor: string | number | null | undefined;
  } | null>(null);
  const [isPendingIntent, setIsPendingIntent] = useState(false);

  const inFlightCursorRef = useRef<string | number | null | undefined>(null);
  const generationRef = useRef(0);
  const restingRef = useRef({ offset: Number.NaN, followUps: 0 });
  const prevBusyRef = useRef(isBusy);

  // Track whether an active paging action was initiated by end-reached.
  // Resting follow-ups should ONLY trigger if the user reached bottom, not on initial load/refresh.
  const pagingInitiatedRef = useRef(false);
  const itemCountAtPagingRef = useRef<number | undefined>(undefined);

  const cancelPendingIntent = useCallback(() => {
    generationRef.current += 1;
    pendingIntentRef.current = null;
    setIsPendingIntent(false);
    inFlightCursorRef.current = null;
    pagingInitiatedRef.current = false;
    restingRef.current = { offset: Number.NaN, followUps: 0 };
  }, []);

  const dispatchFetch = useCallback(async () => {
    if (!isActive || !hasNextPage || isFetchNextPageError || isAutoFetching) {
      return;
    }
    if (cursor === undefined || cursor === null) {
      return;
    }

    if (isBusy) {
      pendingIntentRef.current = { cursor };
      setIsPendingIntent(true);
      pagingInitiatedRef.current = true;
      itemCountAtPagingRef.current = itemCount;
      return;
    }

    if (inFlightCursorRef.current === cursor) {
      return;
    }

    inFlightCursorRef.current = cursor;
    pagingInitiatedRef.current = true;
    itemCountAtPagingRef.current = itemCount;
    const currentGen = ++generationRef.current;

    try {
      const result = await onFetchNextPage();
      if (generationRef.current !== currentGen) return;

      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'blocked'
      ) {
        if (isActive && hasNextPage && !isFetchNextPageError) {
          pendingIntentRef.current = { cursor };
          setIsPendingIntent(true);
        } else {
          pendingIntentRef.current = null;
          setIsPendingIntent(false);
          pagingInitiatedRef.current = false;
        }
      } else {
        pendingIntentRef.current = null;
        setIsPendingIntent(false);
      }
    } catch {
      if (generationRef.current === currentGen) {
        pendingIntentRef.current = null;
        setIsPendingIntent(false);
        pagingInitiatedRef.current = false;
      }
    } finally {
      if (generationRef.current === currentGen) {
        inFlightCursorRef.current = null;
      }
    }
  }, [
    cursor,
    hasNextPage,
    isActive,
    isAutoFetching,
    isBusy,
    isFetchNextPageError,
    itemCount,
    onFetchNextPage,
  ]);

  const handleEndReached = useCallback(() => {
    const list = listRef?.current;
    const currentOffset = list?.getAbsoluteLastScrollOffset?.() ?? Number.NaN;
    if (!Number.isNaN(currentOffset)) {
      if (currentOffset !== restingRef.current.offset) {
        restingRef.current = { offset: currentOffset, followUps: 0 };
      } else if (restingRef.current.followUps >= MAX_RESTING_FOLLOW_UPS) {
        return;
      }
    }
    void dispatchFetch();
  }, [dispatchFetch, listRef]);

  // When new visible items arrive, reset the resting follow-up budget.
  useEffect(() => {
    if (
      itemCount !== undefined &&
      itemCountAtPagingRef.current !== undefined &&
      itemCount > itemCountAtPagingRef.current
    ) {
      restingRef.current = { offset: Number.NaN, followUps: 0 };
    }
  }, [itemCount]);

  // When blocking conditions recover, dispatch the pending intent at most once.
  useEffect(() => {
    if (!isActive) {
      generationRef.current += 1;
      pagingInitiatedRef.current = false;
      if (pendingIntentRef.current !== null) {
        pendingIntentRef.current = null;
        setIsPendingIntent(false);
      }
      inFlightCursorRef.current = null;
      return;
    }

    const pending = pendingIntentRef.current;
    if (!pending) return;

    // Cursor changed (e.g. refreshed or new data arrived) -> cancel expired intent.
    if (pending.cursor !== cursor) {
      generationRef.current += 1;
      pagingInitiatedRef.current = false;
      pendingIntentRef.current = null;
      setIsPendingIntent(false);
      inFlightCursorRef.current = null;
      restingRef.current = { offset: Number.NaN, followUps: 0 };
      return;
    }

    // Cancel pending intent if query errored or has no more pages.
    if (!hasNextPage || isFetchNextPageError) {
      pendingIntentRef.current = null;
      setIsPendingIntent(false);
      pagingInitiatedRef.current = false;
      return;
    }

    // Wait if still busy.
    if (isBusy) {
      return;
    }

    pendingIntentRef.current = null;
    setIsPendingIntent(false);
    void dispatchFetch();
  }, [
    cursor,
    dispatchFetch,
    hasNextPage,
    isActive,
    isBusy,
    isFetchNextPageError,
  ]);

  // Resting near end zone follow-up:
  // When an end-reached page finishes and the list is still resting in the end zone
  // without adding visible items, allow limited follow-up requests.
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = isBusy;

    if (!wasBusy || isBusy) return;

    // Only follow up if this load originated from an end-reached attempt.
    if (!pagingInitiatedRef.current) return;
    pagingInitiatedRef.current = false;

    if (!isActive || !hasNextPage || isFetchNextPageError || isAutoFetching) {
      return;
    }
    if (!listRef?.current) return;

    // If visible items increased, new content was loaded; user should scroll to reach bottom again.
    if (
      itemCount !== undefined &&
      itemCountAtPagingRef.current !== undefined &&
      itemCount > itemCountAtPagingRef.current
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || !isNearEnd(list, endReachedThreshold)) return;
      const offset = list.getAbsoluteLastScrollOffset?.() ?? 0;
      if (offset !== restingRef.current.offset) {
        restingRef.current = { offset, followUps: 0 };
      }
      if (restingRef.current.followUps >= MAX_RESTING_FOLLOW_UPS) return;
      restingRef.current.followUps += 1;
      void dispatchFetch();
    });

    return () => cancelAnimationFrame(frame);
  }, [
    dispatchFetch,
    endReachedThreshold,
    hasNextPage,
    isActive,
    isAutoFetching,
    isBusy,
    isFetchNextPageError,
    itemCount,
    listRef,
  ]);

  return {
    handleEndReached,
    isPendingIntent,
    cancelPendingIntent,
  };
}
