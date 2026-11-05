import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  const followUpFrameRef = useRef<number | null>(null);

  const latestOptionsRef = useRef({
    isActive,
    hasNextPage,
    isFetchNextPageError,
    isBusy,
    cursor,
    onFetchNextPage,
    itemCount,
    isAutoFetching,
    listRef,
    endReachedThreshold,
  });
  useLayoutEffect(() => {
    latestOptionsRef.current = {
      isActive,
      hasNextPage,
      isFetchNextPageError,
      isBusy,
      cursor,
      onFetchNextPage,
      itemCount,
      isAutoFetching,
      listRef,
      endReachedThreshold,
    };
  });

  const cancelPendingIntent = useCallback(() => {
    generationRef.current += 1;
    if (followUpFrameRef.current !== null) {
      cancelAnimationFrame(followUpFrameRef.current);
      followUpFrameRef.current = null;
    }
    pendingIntentRef.current = null;
    setIsPendingIntent(false);
    inFlightCursorRef.current = null;
    pagingInitiatedRef.current = false;
    restingRef.current = { offset: Number.NaN, followUps: 0 };
  }, []);

  const dispatchFetch = useCallback(async () => {
    const opts = latestOptionsRef.current;
    if (
      !opts.isActive ||
      !opts.hasNextPage ||
      opts.isFetchNextPageError ||
      opts.isAutoFetching
    ) {
      return;
    }
    if (opts.cursor === undefined || opts.cursor === null) {
      return;
    }

    if (opts.isBusy) {
      pendingIntentRef.current = { cursor: opts.cursor };
      setIsPendingIntent(true);
      pagingInitiatedRef.current = true;
      itemCountAtPagingRef.current = opts.itemCount;
      return;
    }

    if (inFlightCursorRef.current === opts.cursor) {
      return;
    }

    const inFlightCursor = opts.cursor;
    inFlightCursorRef.current = inFlightCursor;
    pagingInitiatedRef.current = true;
    itemCountAtPagingRef.current = opts.itemCount;
    const currentGen = ++generationRef.current;

    try {
      const result = await opts.onFetchNextPage();
      if (generationRef.current !== currentGen) return;

      if (
        result &&
        typeof result === 'object' &&
        'status' in result &&
        result.status === 'blocked'
      ) {
        const latestOpts = latestOptionsRef.current;
        if (
          latestOpts.isActive &&
          latestOpts.hasNextPage &&
          !latestOpts.isFetchNextPageError &&
          latestOpts.cursor === inFlightCursor
        ) {
          pendingIntentRef.current = { cursor: inFlightCursor };
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
  }, []);

  const handleEndReached = useCallback(() => {
    const opts = latestOptionsRef.current;
    const list = opts.listRef?.current;
    const currentOffset = list?.getAbsoluteLastScrollOffset?.() ?? Number.NaN;
    if (!Number.isNaN(currentOffset)) {
      if (currentOffset !== restingRef.current.offset) {
        restingRef.current = { offset: currentOffset, followUps: 0 };
      } else if (restingRef.current.followUps >= MAX_RESTING_FOLLOW_UPS) {
        return;
      }
    }
    void dispatchFetch();
  }, [dispatchFetch]);

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
      if (followUpFrameRef.current !== null) {
        cancelAnimationFrame(followUpFrameRef.current);
        followUpFrameRef.current = null;
      }
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
      if (followUpFrameRef.current !== null) {
        cancelAnimationFrame(followUpFrameRef.current);
        followUpFrameRef.current = null;
      }
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

    const opts = latestOptionsRef.current;
    if (
      !opts.isActive ||
      !opts.hasNextPage ||
      opts.isFetchNextPageError ||
      opts.isAutoFetching
    ) {
      return;
    }

    if (
      opts.itemCount !== undefined &&
      itemCountAtPagingRef.current !== undefined &&
      opts.itemCount > itemCountAtPagingRef.current
    ) {
      return;
    }

    if (followUpFrameRef.current !== null) {
      cancelAnimationFrame(followUpFrameRef.current);
    }

    const currentGen = generationRef.current;
    followUpFrameRef.current = requestAnimationFrame(() => {
      followUpFrameRef.current = null;
      if (generationRef.current !== currentGen) return;
      if (!pagingInitiatedRef.current) return;

      const currentOpts = latestOptionsRef.current;
      if (
        !currentOpts.isActive ||
        !currentOpts.hasNextPage ||
        currentOpts.isFetchNextPageError ||
        currentOpts.isAutoFetching
      ) {
        return;
      }

      if (
        currentOpts.itemCount !== undefined &&
        itemCountAtPagingRef.current !== undefined &&
        currentOpts.itemCount > itemCountAtPagingRef.current
      ) {
        pagingInitiatedRef.current = false;
        return;
      }

      const list = currentOpts.listRef?.current;
      if (!list || !isNearEnd(list, currentOpts.endReachedThreshold)) return;
      const offset = list.getAbsoluteLastScrollOffset?.() ?? 0;
      if (offset !== restingRef.current.offset) {
        restingRef.current = { offset, followUps: 0 };
      }
      if (restingRef.current.followUps >= MAX_RESTING_FOLLOW_UPS) return;

      pagingInitiatedRef.current = false;
      restingRef.current.followUps += 1;
      void dispatchFetch();
    });
  }, [dispatchFetch, isBusy]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      if (followUpFrameRef.current !== null) {
        cancelAnimationFrame(followUpFrameRef.current);
        followUpFrameRef.current = null;
      }
    };
  }, []);

  return {
    handleEndReached,
    isPendingIntent,
    cancelPendingIntent,
  };
}
