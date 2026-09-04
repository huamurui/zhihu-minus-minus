import {
  forwardRef,
  type RefObject,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import type { ScrollViewProps } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

export type GestureScrollViewRef = RefObject<ScrollView | null>;

// Pair this renderer with RNGH's RefreshControl so Android refresh and scroll
// handlers can coordinate on the actual native views.
export function useGestureScrollView() {
  const scrollGestureRef = useRef<ScrollView>(null);
  // FlashList recreates its scroller when the renderer identity changes.
  const renderScrollComponent = useMemo(
    () =>
      forwardRef<ScrollView, ScrollViewProps>((props, forwardedRef) => {
        const setRef = useCallback(
          (node: ScrollView | null) => {
            scrollGestureRef.current = node;
            // FlashList still needs its ref for animated events and scrollToIndex.
            if (typeof forwardedRef === 'function') {
              return forwardedRef(node);
            }
            if (forwardedRef) forwardedRef.current = node;
          },
          [forwardedRef],
        );

        return (
          <ScrollView {...props} ref={setRef} disallowInterruption={false} />
        );
      }),
    [],
  );

  return { scrollGestureRef, renderScrollComponent };
}
