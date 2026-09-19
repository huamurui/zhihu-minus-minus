import {
  runOnJS,
  type SharedValue,
  useAnimatedScrollHandler,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

export const FOOTER_HIDE_DISTANCE = 100;

export function useScrollHeaderAnim(
  threshold = 300,
  onScroll?: (currentY: number) => void,
  onScrollThrottleMs = 0,
  sharedScrollY?: SharedValue<number>,
) {
  const headerVisible = useSharedValue(0);
  const isHeaderShown = useSharedValue(false);
  const lastScrollY = useSharedValue(0);
  const lastCallbackTime = useSharedValue(0);
  const footerOffset = useSharedValue(0);

  const handleScroll = useAnimatedScrollHandler(
    {
      onScroll: (event) => {
        const currentY = event.contentOffset.y;
        if (sharedScrollY) {
          sharedScrollY.value = currentY;
        }
        const diff = currentY - lastScrollY.value;

        if (currentY > threshold) {
          if (diff < -15 && !isHeaderShown.value) {
            isHeaderShown.value = true;
            headerVisible.value = withTiming(1, { duration: 250 });
          } else if (diff > 5 && isHeaderShown.value) {
            isHeaderShown.value = false;
            headerVisible.value = withTiming(0, { duration: 200 });
          }
        } else if (currentY <= 100 && isHeaderShown.value) {
          isHeaderShown.value = false;
          headerVisible.value = withTiming(0, { duration: 200 });
        }

        // 底部交互栏随滚动折叠/展开，与首页底部导航一致：
        // 向下滚动累加偏移直到完全隐藏，向上滚动累减直到完全显示。
        if (currentY <= 0) {
          footerOffset.value = 0;
        } else {
          footerOffset.value = Math.min(
            FOOTER_HIDE_DISTANCE,
            Math.max(0, footerOffset.value + diff),
          );
        }

        lastScrollY.value = currentY;

        const now = Date.now();
        if (
          onScroll &&
          (onScrollThrottleMs <= 0 ||
            now - lastCallbackTime.value >= onScrollThrottleMs)
        ) {
          lastCallbackTime.value = now;
          runOnJS(onScroll)(currentY);
        }
      },
    },
    [onScroll, onScrollThrottleMs, sharedScrollY, threshold],
  );

  return { headerVisible, footerOffset, handleScroll };
}
