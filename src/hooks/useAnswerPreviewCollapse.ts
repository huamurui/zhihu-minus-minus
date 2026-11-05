import type { FlashListRef } from '@shopify/flash-list';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

/** No scroll event for this long after the programmatic scroll means it has settled. */
const SCROLL_SETTLE_MS = 120;
/** Give the animated scroll this long to emit its first event. */
const SCROLL_START_MS = 250;
/** Collapse anyway if the scroll never settles (e.g. the user keeps dragging). */
const SCROLL_MAX_MS = 1200;
/** Keep re-anchoring while FlashList re-measures the collapsed card. */
const ANCHOR_WINDOW_MS = 600;

interface PendingCollapse {
  index: number;
  collapse: () => void;
  settleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

interface Anchor {
  index: number;
  /** Distance from the viewport top to the anchored card's top. */
  offsetFromViewport: number;
  until: number;
}

/**
 * Collapsing an expanded answer in place pulls the content under the reader's
 * eyes. Instead, scroll smoothly back to the answer's start, then collapse it
 * once the scroll settles: the top of the card, which the collapsed preview
 * keeps, stays put and only the content below it changes.
 */
export function useAnswerPreviewCollapse<T>({
  listRef,
  scope,
  viewOffset,
}: {
  listRef: RefObject<FlashListRef<T> | null>;
  scope: string;
  /** Distance from the list top at which a card's start should rest. */
  viewOffset: number;
}) {
  const pending = useRef<PendingCollapse | null>(null);
  const anchor = useRef<Anchor | null>(null);

  const clearPending = useCallback(() => {
    if (!pending.current) return;
    clearTimeout(pending.current.settleTimer);
    clearTimeout(pending.current.maxTimer);
    pending.current = null;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scope changes must drop work queued for the previous list.
  useEffect(() => {
    anchor.current = null;
    return clearPending;
  }, [scope, clearPending]);

  const collapseAnchored = useCallback(
    (index: number, applyCollapse: () => void) => {
      const list = listRef.current;
      const layout = list?.getLayout(index);
      if (list && layout) {
        anchor.current = {
          index,
          offsetFromViewport: layout.y - list.getAbsoluteLastScrollOffset(),
          until: Date.now() + ANCHOR_WINDOW_MS,
        };
      }
      applyCollapse();
    },
    [listRef],
  );

  const finish = useCallback(() => {
    const current = pending.current;
    if (!current) return;
    clearPending();
    collapseAnchored(current.index, current.collapse);
  }, [clearPending, collapseAnchored]);

  const collapse = useCallback(
    (index: number, applyCollapse: () => void) => {
      clearPending();
      const list = listRef.current;
      const layout = list?.getLayout(index);
      if (!list || !layout) {
        applyCollapse();
        return;
      }
      // Layouts exclude the list's top padding; scroll offsets include it.
      const top =
        layout.y +
        list.getFirstItemOffset() -
        list.getAbsoluteLastScrollOffset();
      if (top >= viewOffset) {
        // The answer's start is already on screen; only content below changes.
        collapseAnchored(index, applyCollapse);
        return;
      }
      pending.current = {
        index,
        collapse: applyCollapse,
        settleTimer: setTimeout(finish, SCROLL_START_MS),
        maxTimer: setTimeout(finish, SCROLL_MAX_MS),
      };
      list.scrollToIndex({
        index,
        animated: true,
        // FlashList 2 adds this offset to the target scroll position.
        viewOffset: -viewOffset,
      });
    },
    [clearPending, collapseAnchored, finish, listRef, viewOffset],
  );

  const onScroll = useCallback(() => {
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.settleTimer);
    current.settleTimer = setTimeout(finish, SCROLL_SETTLE_MS);
  }, [finish]);

  /** Pass to FlashList `onScrollBeginDrag`: the reader now owns the scroll. */
  const onScrollBeginDrag = useCallback(() => {
    anchor.current = null;
    const current = pending.current;
    if (!current) return;
    clearPending();
    current.collapse();
  }, [clearPending]);

  /** Pass to FlashList `onCommitLayoutEffect`. */
  const onCommitLayout = useCallback(() => {
    const current = anchor.current;
    const list = listRef.current;
    if (!current || !list) return;
    if (Date.now() > current.until) {
      anchor.current = null;
      return;
    }
    const layout = list.getLayout(current.index);
    if (!layout) return;
    const target = layout.y - current.offsetFromViewport;
    if (Math.abs(list.getAbsoluteLastScrollOffset() - target) > 1)
      list.scrollToOffset({ offset: target, animated: false });
  }, [listRef]);

  return { collapse, onScroll, onScrollBeginDrag, onCommitLayout };
}
