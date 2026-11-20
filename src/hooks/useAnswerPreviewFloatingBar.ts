import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  ZhihuPreviewLoginPrompt,
  ZhihuReadingPreviewItem,
} from '@/api/zhihu/nextRender';

type FooterView = Pick<ViewInstance, 'measureInWindow'>;
type PreviewAnswer = Exclude<ZhihuReadingPreviewItem, ZhihuPreviewLoginPrompt>;

interface FloatingBarOptions {
  scope: string;
  items: readonly ZhihuReadingPreviewItem[];
  expandedIds: ReadonlySet<string>;
  navigationHeight: number;
}

interface ViewableItems {
  viewableItems: Array<{
    item: ZhihuReadingPreviewItem;
    isViewable?: boolean;
  }>;
}

/** Reveal answer actions only while its expanded body hides every visible footer. */
export function useAnswerPreviewFloatingBar({
  scope,
  items,
  expandedIds,
  navigationHeight,
}: FloatingBarOptions) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const epoch = useMemo(
    () => ({
      scope,
      viewableIds: [] as string[],
      footers: new Map<string, FooterView>(),
      scrollY: 0,
      sequence: 0,
      lastCheck: 0,
    }),
    [scope],
  );
  const inputs = useMemo(
    () => ({
      items,
      expandedIds,
      top: navigationHeight,
      bottom: height - insets.bottom,
    }),
    [items, expandedIds, navigationHeight, height, insets.bottom],
  );
  const currentEpoch = useRef(epoch);
  const currentInputs = useRef(inputs);
  currentEpoch.current = epoch;
  currentInputs.current = inputs;
  const mounted = useRef(true);
  const [bar, setBar] = useState({
    epoch,
    id: null as string | null,
    visible: false,
  });
  const viewabilityConfig = useMemo(
    () => ({ viewAreaCoveragePercentThreshold: 20 }),
    [],
  );

  const updateBar = useCallback(
    (id: string | null, visible: boolean) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      setBar((previous) =>
        previous.epoch === epoch &&
        previous.id === id &&
        previous.visible === visible
          ? previous
          : { epoch, id, visible },
      );
    },
    [epoch],
  );

  const measureFooters = useCallback(
    (force = false) => {
      if (!mounted.current || currentEpoch.current !== epoch) return;
      const snapshot = currentInputs.current;
      const firstId = epoch.viewableIds[0] ?? null;
      const views = epoch.viewableIds.map((id) => ({
        id,
        view: epoch.footers.get(id),
      }));
      if (
        epoch.scrollY <= 300 ||
        !views.some(({ id }) => snapshot.expandedIds.has(id)) ||
        views.some(({ view }) => !view) ||
        snapshot.bottom <= snapshot.top
      ) {
        epoch.sequence += 1;
        updateBar(firstId, false);
        return;
      }

      const now = Date.now();
      if (!force && now - epoch.lastCheck < 100) return;
      epoch.lastCheck = now;
      const sequence = ++epoch.sequence;

      let remaining = views.length;
      let anyVisible = false;
      let invalid = false;
      // FlashList includes rows behind the fixed header and may deliver
      // viewability after the previous answer has already scrolled away.
      let nearestY = Infinity;
      let nearestId: string | null = null;
      for (const { id, view } of views) {
        if (!view) continue;
        view.measureInWindow((_x, y, width, footerHeight) => {
          if (
            !mounted.current ||
            currentEpoch.current !== epoch ||
            currentInputs.current !== snapshot ||
            epoch.sequence !== sequence ||
            epoch.footers.get(id) !== view
          )
            return;
          if (
            !Number.isFinite(y) ||
            !Number.isFinite(width) ||
            !Number.isFinite(footerHeight) ||
            width <= 0 ||
            footerHeight <= 0
          ) {
            invalid = true;
          } else if (y + footerHeight > snapshot.top) {
            if (y < snapshot.bottom) anyVisible = true;
            if (y < nearestY) {
              nearestY = y;
              nearestId = id;
            }
          }
          remaining -= 1;
          if (remaining === 0) {
            const visible =
              !invalid &&
              !anyVisible &&
              nearestId !== null &&
              snapshot.expandedIds.has(nearestId);
            updateBar(nearestId ?? firstId, visible);
          }
        });
      }
    },
    [epoch, updateBar],
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: ViewableItems) => {
      if (currentEpoch.current !== epoch) return;
      const answers = viewableItems
        .filter((entry) => entry.isViewable !== false)
        .map((entry) => entry.item)
        .filter((item): item is PreviewAnswer => item.type === 'answer');
      epoch.viewableIds = [...new Set(answers.map((answer) => answer.id))];
      updateBar(epoch.viewableIds[0] ?? null, false);
      measureFooters(true);
    },
    [epoch, measureFooters, updateBar],
  );

  const updateScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>, force: boolean) => {
      if (currentEpoch.current !== epoch) return;
      const y = event.nativeEvent.contentOffset.y;
      epoch.scrollY = Number.isFinite(y) ? Math.max(0, y) : 0;
      epoch.sequence += 1;
      measureFooters(force || epoch.scrollY <= 300);
    },
    [epoch, measureFooters],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      updateScroll(event, false),
    [updateScroll],
  );
  const onScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) =>
      updateScroll(event, true),
    [updateScroll],
  );

  const registerFooter = useCallback(
    (id: string, view: FooterView | null) => {
      if (currentEpoch.current !== epoch) return;
      if (view) epoch.footers.set(id, view);
      else epoch.footers.delete(id);
      if (!epoch.viewableIds.includes(id)) return;
      updateBar(epoch.viewableIds[0] ?? null, false);
      measureFooters(true);
    },
    [epoch, measureFooters, updateBar],
  );

  const onFooterLayout = useCallback(
    () => measureFooters(true),
    [measureFooters],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.sequence += 1;
    };
  }, [epoch]);

  useEffect(() => {
    if (currentInputs.current === inputs) measureFooters(true);
  }, [inputs, measureFooters]);

  const activeAnswer =
    bar.epoch === epoch
      ? (items.find(
          (item): item is PreviewAnswer =>
            item.type === 'answer' && item.id === bar.id,
        ) ?? null)
      : null;
  const visible = Boolean(
    bar.visible && activeAnswer && expandedIds.has(activeAnswer.id),
  );

  return {
    activeAnswer,
    visible,
    onViewableItemsChanged,
    viewabilityConfig,
    onScroll,
    onScrollEnd,
    registerFooter,
    onFooterLayout,
  };
}
