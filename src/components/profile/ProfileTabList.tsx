import { FlashList, type FlashListRef } from '@shopify/flash-list';
import {
  forwardRef,
  type ReactNode,
  type RefObject,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  ActivityIndicator,
  type ViewInstance as NativeView,
} from 'react-native';
import Reanimated, {
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { QueryErrorView } from '@/components/QueryErrorView';
import { Text, useThemeColor, View } from '@/components/Themed';
import { useListPreload, useLoadMoreNearEnd } from '@/hooks/useListPreload';
import { useRefreshAction } from '@/hooks/useRefreshAction';
import {
  getProfileMinContentHeight,
  getProfileResizedOffset,
} from '@/utils/profileScroll';

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList);
const OFFSET_TOLERANCE = 1;

export interface ProfileListQuery {
  data: unknown[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  hasNextPage: boolean | undefined;
  refetch: () => Promise<unknown>;
  fetchNextPage: () => Promise<unknown>;
  refresh: () => Promise<unknown>;
}

export interface ProfileTabListHandle {
  scrollToOffset: (offset: number, animated?: boolean) => void;
}

export interface ProfileTabListProps {
  index: number;
  label: string;
  query: ProfileListQuery;
  headerHeight: number;
  collapseDistance: number;
  viewportHeight: number;
  bottomInset: number;
  offsets: SharedValue<number[]>;
  active: boolean;
  renderItem: (item: unknown) => ReactNode;
  keyExtractor: (item: unknown) => string;
  listHeader?: ReactNode;
  emptyState?: ReactNode;
  /** Reports when the user drags or flings this list vertically. */
  onScrollActivityChange?: (active: boolean) => void;
  /** Keep initial profile placeholders still while the member details load. */
  hideInitialLoadingIndicator?: boolean;
}

interface PendingScroll {
  id: number;
  offset: number;
  animated: boolean;
}

export const ProfileTabList = forwardRef<
  ProfileTabListHandle,
  ProfileTabListProps
>(function ProfileTabList(
  {
    index,
    label,
    query,
    headerHeight,
    collapseDistance,
    viewportHeight,
    bottomInset,
    offsets,
    active,
    renderItem,
    keyExtractor,
    listHeader,
    emptyState,
    onScrollActivityChange,
    hideInitialLoadingIndicator = false,
  },
  ref,
) {
  const primaryColor = useThemeColor({}, 'primary');
  const listPreload = useListPreload(0.4);
  const listRef = useRef<FlashListRef<unknown> | null>(null);
  const contentRef = useRef<NativeView>(null);
  const loadedRef = useRef(false);
  const contentHeightRef = useRef(0);
  const measurementIdRef = useRef(0);
  const pendingRef = useRef<PendingScroll | null>(null);
  const requestIdRef = useRef(0);
  const requestedScroll = useSharedValue<{
    id: number;
    offset: number;
  } | null>(null);
  const previousGeometry = useRef({
    headerHeight,
    collapseDistance,
    viewportHeight,
    bottomInset,
  });
  const { refresh, refreshing } = useRefreshAction(query.refresh);
  const refreshPending = useRef(false);
  const paginationPending = useRef(false);

  const finishScroll = useCallback((requestId: number) => {
    if (pendingRef.current?.id === requestId) pendingRef.current = null;
  }, []);

  const cancelPendingScroll = useCallback(() => {
    pendingRef.current = null;
  }, []);

  const reportScrollActivity = useCallback(
    (active: boolean) => onScrollActivityChange?.(active),
    [onScrollActivityChange],
  );

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      const offset = Math.max(0, event.contentOffset.y);
      const currentOffsets = [...offsets.value];
      currentOffsets[index] = offset;
      offsets.value = currentOffsets;
      const request = requestedScroll.value;
      if (request && Math.abs(offset - request.offset) <= OFFSET_TOLERANCE) {
        requestedScroll.value = null;
        runOnJS(finishScroll)(request.id);
      }
    },
    onBeginDrag: () => {
      requestedScroll.value = null;
      runOnJS(cancelPendingScroll)();
      runOnJS(reportScrollActivity)(true);
    },
    onEndDrag: () => {
      runOnJS(reportScrollActivity)(false);
    },
    onMomentumBegin: () => {
      runOnJS(reportScrollActivity)(true);
    },
    onMomentumEnd: () => {
      runOnJS(reportScrollActivity)(false);
    },
  });

  const applyPendingScroll = useCallback(() => {
    const pending = pendingRef.current;
    if (
      !pending ||
      !loadedRef.current ||
      contentHeightRef.current <= 0 ||
      viewportHeight <= 0 ||
      !listRef.current
    ) {
      return;
    }
    const offset = Math.min(
      pending.offset,
      Math.max(0, contentHeightRef.current - viewportHeight),
    );
    requestedScroll.value = { id: pending.id, offset };
    listRef.current.scrollToOffset({ offset, animated: pending.animated });
    if (Math.abs((offsets.value[index] || 0) - offset) <= OFFSET_TOLERANCE) {
      // Native need not emit an event for a request to its existing position.
      requestedScroll.value = null;
      finishScroll(pending.id);
    }
  }, [finishScroll, index, offsets, requestedScroll, viewportHeight]);

  const scrollToOffset = useCallback(
    (offset: number, animated = false) => {
      pendingRef.current = {
        id: ++requestIdRef.current,
        offset: Number.isFinite(offset) ? Math.max(0, offset) : 0,
        animated,
      };
      applyPendingScroll();
    },
    [applyPendingScroll],
  );

  useImperativeHandle(ref, () => ({ scrollToOffset }), [scrollToOffset]);

  const measureContent = useCallback(() => {
    if (!loadedRef.current || !contentRef.current) return;
    const measurementId = ++measurementIdRef.current;
    contentRef.current.measure((_x, _y, width, height) => {
      if (
        measurementId !== measurementIdRef.current ||
        !listRef.current ||
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      ) {
        return;
      }
      contentHeightRef.current = height;
      applyPendingScroll();
    });
  }, [applyPendingScroll]);

  useLayoutEffect(() => {
    const previous = previousGeometry.current;
    previousGeometry.current = {
      headerHeight,
      collapseDistance,
      viewportHeight,
      bottomInset,
    };
    if (
      previous.headerHeight === headerHeight &&
      previous.collapseDistance === collapseDistance &&
      previous.viewportHeight === viewportHeight &&
      previous.bottomInset === bottomInset
    ) {
      applyPendingScroll();
      return;
    }
    const offset = pendingRef.current?.offset ?? offsets.value[index] ?? 0;
    measurementIdRef.current += 1;
    contentHeightRef.current = 0;
    requestedScroll.value = null;
    scrollToOffset(
      // Before the first header measurement, pending requests are already
      // absolute offsets. There is no valid old collapse range to remap yet.
      previous.headerHeight <= 0 ||
        (!loadedRef.current && previous.collapseDistance <= 0)
        ? offset
        : getProfileResizedOffset(
            offset,
            previous.collapseDistance,
            collapseDistance,
          ),
    );
    // Padding or sticky-height changes can leave the overall content height
    // unchanged. Explicit measurement also covers that no-onContentSizeChange case.
    measureContent();
    return () => {
      measurementIdRef.current += 1;
    };
  }, [
    applyPendingScroll,
    bottomInset,
    collapseDistance,
    headerHeight,
    index,
    measureContent,
    offsets,
    requestedScroll,
    scrollToOffset,
    viewportHeight,
  ]);

  useLayoutEffect(() => {
    // Offscreen native pages can report zero-sized measurements until selected.
    if (active) measureContent();
  }, [active, measureContent]);

  const loadNextPage = (retry = false) => {
    if (
      !active ||
      !query.hasNextPage ||
      query.isFetching ||
      refreshing ||
      refreshPending.current ||
      paginationPending.current ||
      (!retry && query.isFetchNextPageError)
    ) {
      return;
    }
    paginationPending.current = true;
    void query
      .fetchNextPage()
      .catch(() => undefined)
      .finally(() => {
        paginationPending.current = false;
      });
  };

  useLoadMoreNearEnd({
    listRef,
    threshold: listPreload.onEndReachedThreshold,
    loading: query.isFetching,
    loadMore: loadNextPage,
  });

  const handleRefresh = () => {
    if (!active || refreshPending.current) return;
    refreshPending.current = true;
    void refresh()
      .catch(() => undefined)
      .finally(() => {
        refreshPending.current = false;
      });
  };

  // Mount with the measured spacer from the first frame, so cached cards do
  // not appear underneath the overlay and then jump down after onLayout.
  if (headerHeight <= 0) return null;

  return (
    <AnimatedFlashList
      ref={listRef}
      innerViewRef={
        // RN accepts a nullable ref, but its public prop type omits null.
        contentRef as RefObject<NativeView>
      }
      data={query.data}
      renderItem={({ item }: { item: unknown }) => <>{renderItem(item)}</>}
      keyExtractor={keyExtractor}
      contentContainerStyle={{
        paddingTop: headerHeight,
        minHeight: getProfileMinContentHeight(viewportHeight, collapseDistance),
        paddingBottom: bottomInset + 24,
      }}
      maintainVisibleContentPosition={{ disabled: true }}
      scrollEventThrottle={16}
      onScroll={scrollHandler}
      onLoad={() => {
        loadedRef.current = true;
        applyPendingScroll();
        measureContent();
      }}
      onContentSizeChange={(_width, height) => {
        measurementIdRef.current += 1;
        contentHeightRef.current = height;
        applyPendingScroll();
      }}
      onEndReached={() => loadNextPage()}
      {...listPreload}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      progressViewOffset={headerHeight}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        listHeader ? <View className="bg-transparent">{listHeader}</View> : null
      }
      ListEmptyComponent={
        query.isLoading ? (
          hideInitialLoadingIndicator ? null : (
            <ActivityIndicator style={{ margin: 32 }} color={primaryColor} />
          )
        ) : query.isError ? (
          <QueryErrorView
            message={`${label}加载失败`}
            onRetry={() => void query.refetch().catch(() => undefined)}
          />
        ) : emptyState ? (
          // biome-ignore lint/complexity/noUselessFragments: FlashList requires a ReactElement while emptyState accepts ReactNode.
          <>{emptyState}</>
        ) : (
          <View className="items-center py-20 bg-transparent">
            <Text type="secondary">暂无{label}内容</Text>
          </View>
        )
      }
      ListFooterComponent={
        query.isFetchingNextPage ? (
          <ActivityIndicator style={{ margin: 24 }} color={primaryColor} />
        ) : query.isFetchNextPageError && query.data.length > 0 ? (
          <QueryErrorView
            compact
            message="更多内容加载失败"
            onRetry={() => loadNextPage(true)}
          />
        ) : query.isError && query.data.length > 0 ? (
          <QueryErrorView
            compact
            message="刷新失败，已保留原有内容"
            onRetry={handleRefresh}
          />
        ) : query.data.length > 0 && !query.hasNextPage ? (
          <Text type="secondary" className="text-center p-5 text-xs">
            已显示全部内容
          </Text>
        ) : null
      }
    />
  );
});
