import {
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

export interface CollapsibleChromeScrollOptions {
  enabled: boolean;
  topOffset: SharedValue<number>;
  bottomOffset: SharedValue<number>;
  topHideDistance: number;
  bottomHideDistance: number;
  onScrolledChange?: (scrolled: boolean) => void;
  scrolledShowThreshold?: number;
  scrolledHideThreshold?: number;
}

export function useCollapsibleChromeScroll({
  enabled,
  topOffset,
  bottomOffset,
  topHideDistance,
  bottomHideDistance,
  onScrolledChange,
  scrolledShowThreshold = 300,
  scrolledHideThreshold = 200,
}: CollapsibleChromeScrollOptions) {
  const lastScrollY = useSharedValue(-1);
  const isScrolled = useSharedValue(false);

  return useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const currentY = event.contentOffset.y;

        if (!isScrolled.value && currentY > scrolledShowThreshold) {
          isScrolled.value = true;
          if (onScrolledChange) {
            runOnJS(onScrolledChange)(true);
          }
        } else if (isScrolled.value && currentY < scrolledHideThreshold) {
          isScrolled.value = false;
          if (onScrolledChange) {
            runOnJS(onScrolledChange)(false);
          }
        }

        if (!enabled) {
          lastScrollY.value = currentY;
          return;
        }

        if (currentY <= 0) {
          topOffset.value = 0;
          bottomOffset.value = 0;
          lastScrollY.value = currentY;
          return;
        }

        if (lastScrollY.value >= 0) {
          const delta = currentY - lastScrollY.value;
          topOffset.value = Math.min(
            topHideDistance,
            Math.max(0, topOffset.value + delta),
          );
          bottomOffset.value = Math.min(
            bottomHideDistance,
            Math.max(0, bottomOffset.value + delta),
          );
        }

        // 始终以最新位置为下一帧的基准。导航完全离场后继续滚动不会累积
        // 额外距离，反向滚动的第一帧就会开始把它带回来。
        lastScrollY.value = currentY;
      },
    },
    [
      bottomHideDistance,
      bottomOffset,
      enabled,
      onScrolledChange,
      scrolledHideThreshold,
      scrolledShowThreshold,
      topHideDistance,
      topOffset,
    ],
  );
}
