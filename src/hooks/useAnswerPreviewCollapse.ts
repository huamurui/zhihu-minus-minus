import type { FlashListRef } from '@shopify/flash-list';
import { type RefObject, useCallback, useLayoutEffect, useRef } from 'react';
import type { ZhihuReadingPreviewItem } from '@/api/zhihu/nextRender';

const SCROLL_SETTLE_MS = 120;
const SCROLL_START_MS = 250;
const SCROLL_MAX_MS = 1200;
const ANCHOR_WINDOW_MS = 600;

interface Anchor {
  id: string;
  /** Distance from the viewport top to the start of this answer. */
  viewportTop: number;
  until: number;
}

interface PendingCollapse {
  finish: () => void;
  settleTimer: ReturnType<typeof setTimeout>;
  maxTimer: ReturnType<typeof setTimeout>;
}

type PreviewList = FlashListRef<ZhihuReadingPreviewItem>;

/** FlashList layouts exclude its header and top padding; scroll offsets include both. */
function cardTop(list: PreviewList, id: string): number | undefined {
  const index = list.props.data?.findIndex(
    (item) => item.type === 'answer' && item.id === id,
  );
  if (index === undefined || index < 0) return undefined;
  const layout = list.getLayout(index);
  return layout && layout.y + list.getFirstItemOffset();
}

/** Scroll to the top of a long answer before shrinking the content below it. */
export function useAnswerPreviewCollapse({
  listRef,
  scope,
  viewOffset,
}: {
  listRef: RefObject<PreviewList | null>;
  scope: string;
  viewOffset: number;
}) {
  const pending = useRef<PendingCollapse | null>(null);
  const anchor = useRef<Anchor | null>(null);
  const scrollY = useRef<number | null>(null);

  const cancel = useCallback(() => {
    anchor.current = null;
    if (!pending.current) return;
    clearTimeout(pending.current.settleTimer);
    clearTimeout(pending.current.maxTimer);
    pending.current = null;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a different list must never inherit a pending scroll.
  useLayoutEffect(() => {
    scrollY.current = null;
    return cancel;
  }, [scope, cancel]);

  const onCommitLayout = useCallback(() => {
    const current = anchor.current;
    const list = listRef.current;
    if (!current || !list) return;
    const top = cardTop(list, current.id);
    if (Date.now() > current.until || top === undefined) {
      anchor.current = null;
      return;
    }
    const target = Math.max(0, top - current.viewportTop);
    if (
      Math.abs(
        (scrollY.current ?? list.getAbsoluteLastScrollOffset()) - target,
      ) > 1
    ) {
      scrollY.current = target;
      list.scrollToOffset({ offset: target, animated: false });
    }
  }, [listRef]);

  const collapse = useCallback(
    (id: string, applyCollapse: () => void) => {
      cancel();
      const list = listRef.current;
      const top = list && cardTop(list, id);
      if (!list || top == null) {
        applyCollapse();
        return;
      }
      const currentOffset =
        scrollY.current ?? list.getAbsoluteLastScrollOffset();
      scrollY.current = currentOffset;
      const targetOffset = Math.max(0, top - viewOffset);
      const needsScroll = currentOffset > targetOffset + 1;
      const viewportTop = top - (needsScroll ? targetOffset : currentOffset);
      const finish = () => {
        cancel();
        if (listRef.current !== list || cardTop(list, id) === undefined) return;
        anchor.current = {
          id,
          viewportTop,
          until: Date.now() + ANCHOR_WINDOW_MS,
        };
        // The header or the answer may have moved while the animation was running.
        if (needsScroll) onCommitLayout();
        applyCollapse();
      };
      if (!needsScroll) {
        finish();
        return;
      }

      pending.current = {
        finish,
        settleTimer: setTimeout(finish, SCROLL_START_MS),
        maxTimer: setTimeout(finish, SCROLL_MAX_MS),
      };
      // The pressed card is already measured. A native offset scroll also lets
      // a drag immediately interrupt it without a queued scrollToIndex jump.
      list.scrollToOffset({ offset: targetOffset, animated: true });
    },
    [cancel, listRef, onCommitLayout, viewOffset],
  );

  const onScroll = useCallback((offset: number) => {
    // FlashList reconstructs its offset with the latest header height, even
    // when a header resize has not moved the native viewport.
    if (Number.isFinite(offset)) scrollY.current = offset;
    const current = pending.current;
    if (!current) return;
    clearTimeout(current.settleTimer);
    current.settleTimer = setTimeout(current.finish, SCROLL_SETTLE_MS);
  }, []);

  return { collapse, onScroll, cancel, onCommitLayout };
}
