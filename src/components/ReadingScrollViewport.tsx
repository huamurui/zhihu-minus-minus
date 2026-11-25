import { type ReactElement, type Ref, useEffect, useMemo } from 'react';
import { Platform, View, type ViewInstance } from 'react-native';
import { Gesture, GestureDetector, State } from 'react-native-gesture-handler';
import {
  type SharedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { updateScrollIndicatorPull } from '@/utils/scrollIndicator';

interface ReadingScrollViewportProps {
  children: ReactElement;
  ref?: Ref<ViewInstance>;
  doubleTap: ReturnType<typeof Gesture.Tap>;
  focused: boolean;
  scrollY: SharedValue<number>;
  viewportHeight: SharedValue<number>;
  contentHeight: SharedValue<number>;
  edgePull: SharedValue<number>;
}

export function ReadingScrollViewport({
  children,
  ref,
  doubleTap,
  focused,
  scrollY,
  viewportHeight,
  contentHeight,
  edgePull,
}: ReadingScrollViewportProps) {
  const lastTouchY = useSharedValue<number | null>(null);
  useEffect(() => {
    if (focused && Platform.OS === 'android')
      return () => {
        edgePull.value = 0;
      };
  }, [edgePull, focused]);
  const nativeScroll = useMemo(() => {
    // UIScrollView reports elastic offsets directly. Android's EdgeEffect can
    // stretch the content while contentOffset stays pinned to its limit.
    if (Platform.OS !== 'android') return null;
    return Gesture.Native()
      .enabled(focused)
      .simultaneousWithExternalGesture(doubleTap)
      .onTouchesDown(() => {
        lastTouchY.value = null;
        edgePull.value = 0;
      })
      .onTouchesMove((event) => {
        const y =
          event.numberOfTouches === 1 ? event.allTouches[0]?.absoluteY : null;
        const previousY = lastTouchY.value;
        lastTouchY.value = y ?? null;
        // The native ScrollView owns the drag. A tap, long press or horizontal
        // pager swipe should never move the vertical indicator.
        if (event.state !== State.ACTIVE || y == null || previousY == null)
          return;
        edgePull.value = updateScrollIndicatorPull(
          edgePull.value,
          previousY - y,
          scrollY.value,
          contentHeight.value - viewportHeight.value,
        );
      })
      .onFinalize(() => {
        lastTouchY.value = null;
        if (edgePull.value !== 0)
          edgePull.value = withTiming(0, { duration: 180 });
      });
  }, [
    focused,
    doubleTap,
    scrollY,
    contentHeight,
    viewportHeight,
    edgePull,
    lastTouchY,
  ]);

  return (
    <View ref={ref} collapsable={false} style={{ flex: 1 }}>
      {nativeScroll ? (
        <GestureDetector gesture={nativeScroll}>{children}</GestureDetector>
      ) : (
        children
      )}
    </View>
  );
}
