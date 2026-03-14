import { useCallback, useRef } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

export function useScrollHeaderAnim(threshold = 300) {
  const headerVisible = useRef(new Animated.Value(0)).current;
  const isHeaderShowRef = useRef(false);
  const lastScrollY = useRef(0);

  const handleScroll = useCallback(
    (
      event: NativeSyntheticEvent<NativeScrollEvent>,
      callback?: (currentY: number) => void,
    ) => {
      const currentY = event.nativeEvent.contentOffset.y;
      const diff = currentY - (lastScrollY.current || 0);

      if (currentY > threshold) {
        if (diff < -15 && !isHeaderShowRef.current) {
          isHeaderShowRef.current = true;
          Animated.timing(headerVisible, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }).start();
        } else if (diff > 5 && isHeaderShowRef.current) {
          isHeaderShowRef.current = false;
          Animated.timing(headerVisible, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        }
      } else if (currentY <= 100 && isHeaderShowRef.current) {
        isHeaderShowRef.current = false;
        Animated.timing(headerVisible, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }

      // Attach lastY back to event purely for components that rely on reading event.lastY,
      // but locally we track it using lastScrollY
      (event as any).lastY = currentY;
      lastScrollY.current = currentY;

      if (callback) {
        callback(currentY);
      }

      return { currentY, diff };
    },
    [headerVisible, threshold],
  );

  return { headerVisible, handleScroll };
}
