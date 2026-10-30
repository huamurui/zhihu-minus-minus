import type { FlashListRef } from '@shopify/flash-list';
import { type RefObject, useEffect, useRef } from 'react';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * With preloading on, ask for the next page while this many screens remain.
 * FlashList asks once per approach to the end, so this distance is the whole
 * buffer that hides a slow page request during a fast fling.
 */
export const PRELOAD_END_THRESHOLD = 8;

/** Follow-up loads allowed while the list rests at one scroll offset. */
export const MAX_RESTING_FOLLOW_UPS = 3;

/**
 * 列表分页距离；开启「列表预加载」后提前请求下一页。
 * 只提前请求、不加大屏外渲染：真机实测 drawDistance 1500px 让快速滑动的掉帧
 * 从约 3% 升到 10–17%（回答卡片挂载开销大）。
 * 开启后同时隐藏竖向滚动条：列表不断在底部追加，滚动条的长短与位置一直在变，
 * 已不能说明读到了哪里。关闭时不改列表自己的滚动条设置。
 */
export function useListPreload(endThreshold: number): {
  onEndReachedThreshold: number;
  showsVerticalScrollIndicator?: false;
} {
  const enabled = useSettingsStore((state) => state.enableListPreload);
  return enabled
    ? {
        onEndReachedThreshold: Math.max(endThreshold, PRELOAD_END_THRESHOLD),
        showsVerticalScrollIndicator: false,
      }
    : { onEndReachedThreshold: endThreshold };
}

type EndGeometry = Pick<
  FlashListRef<unknown>,
  | 'getAbsoluteLastScrollOffset'
  | 'getWindowSize'
  | 'getChildContainerDimensions'
  | 'getFirstItemOffset'
>;

/** FlashList's own onEndReached test, read from the list's current layout. */
function isNearEnd(list: EndGeometry, threshold: number) {
  const offset = list.getAbsoluteLastScrollOffset();
  const visible = list.getWindowSize().height;
  const content =
    list.getChildContainerDimensions().height + list.getFirstItemOffset();
  if (visible <= 0 || content <= 0) return false;
  return Math.ceil(offset + visible) >= content - threshold * visible;
}

/**
 * FlashList calls onEndReached once as the list enters its end zone, and again
 * only after new data and another scroll. A call that lands while a page is
 * loading is refused, and a page that adds nothing new leaves the list where it
 * was, so a list resting at its end can stop loading with no request in flight.
 * After each load settles, ask again while the list is still in the end zone.
 * Without a scroll in between, at most MAX_RESTING_FOLLOW_UPS such loads run.
 */
export function useLoadMoreNearEnd({
  listRef,
  threshold,
  loading,
  loadMore,
}: {
  listRef: RefObject<EndGeometry | null>;
  threshold: number;
  loading: boolean;
  loadMore: () => void;
}) {
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;
  const resting = useRef({ offset: Number.NaN, followUps: 0 });

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list || !isNearEnd(list, threshold)) return;
      const offset = list.getAbsoluteLastScrollOffset();
      if (offset !== resting.current.offset)
        resting.current = { offset, followUps: 0 };
      if (resting.current.followUps >= MAX_RESTING_FOLLOW_UPS) return;
      resting.current.followUps += 1;
      loadMoreRef.current();
    });
    return () => cancelAnimationFrame(frame);
  }, [listRef, loading, threshold]);
}
