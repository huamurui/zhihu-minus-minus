import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated, Platform } from 'react-native';

let cachedReduceMotion = false;

if (Platform.OS === 'android') {
  void AccessibilityInfo.isReduceMotionEnabled?.()?.then?.((enabled) => {
    cachedReduceMotion = enabled;
  });
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', (enabled) => {
    cachedReduceMotion = enabled;
  });
}

export function setCachedReduceMotionForTest(value: boolean) {
  cachedReduceMotion = value;
}

/** Fade the first measured body in without changing its measured height. */
export function InitialContentReveal({
  ready,
  children,
}: {
  ready: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useRef(cachedReduceMotion);
  const initialOpacity = ready && !reduceMotion.current ? 0 : 1;
  const opacity = useRef(new Animated.Value(initialOpacity)).current;
  const hasRevealed = useRef(false);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled?.()?.then?.((enabled) => {
      cachedReduceMotion = enabled;
      if (!mounted) return;
      reduceMotion.current = enabled;
      if (enabled) {
        opacity.stopAnimation();
        opacity.setValue(1);
      }
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        cachedReduceMotion = enabled;
        reduceMotion.current = enabled;
        if (enabled) {
          opacity.stopAnimation();
          opacity.setValue(1);
        }
      },
    );
    return () => {
      mounted = false;
      subscription?.remove?.();
      opacity.stopAnimation();
    };
  }, [opacity]);

  useLayoutEffect(() => {
    if (Platform.OS !== 'android' || hasRevealed.current) return;
    if (!ready) return;
    hasRevealed.current = true;
    if (reduceMotion.current) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    const animation = Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    });
    animation.start();
    return () => {
      animation.stop();
      opacity.setValue(1);
    };
  }, [ready, opacity]);

  if (Platform.OS !== 'android') {
    return children;
  }

  return (
    <Animated.View pointerEvents="box-none" style={{ opacity }}>
      {children}
    </Animated.View>
  );
}
