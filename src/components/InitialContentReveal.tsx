import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

let cachedReduceMotion = false;
let subscriptionCount = 0;
let removeNativeListener: (() => void) | null = null;
const listeners = new Set<(enabled: boolean) => void>();

function subscribeReduceMotion(
  callback: (enabled: boolean) => void,
): () => void {
  listeners.add(callback);
  callback(cachedReduceMotion);

  if (subscriptionCount === 0) {
    void AccessibilityInfo.isReduceMotionEnabled?.()?.then?.((enabled) => {
      cachedReduceMotion = Boolean(enabled);
      for (const listener of listeners) listener(cachedReduceMotion);
    });
    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        cachedReduceMotion = Boolean(enabled);
        for (const listener of listeners) listener(cachedReduceMotion);
      },
    );
    removeNativeListener = () => {
      subscription?.remove?.();
    };
  }
  subscriptionCount++;

  return () => {
    listeners.delete(callback);
    subscriptionCount--;
    if (subscriptionCount === 0) {
      removeNativeListener?.();
      removeNativeListener = null;
    }
  };
}

export function setCachedReduceMotionForTest(value: boolean) {
  cachedReduceMotion = value;
  for (const listener of listeners) listener(value);
}

export function resetReduceMotionSubscriptionForTest() {
  removeNativeListener?.();
  removeNativeListener = null;
  subscriptionCount = 0;
  listeners.clear();
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
    const unsubscribe = subscribeReduceMotion((enabled) => {
      reduceMotion.current = enabled;
      if (enabled) {
        opacity.stopAnimation();
        opacity.setValue(1);
      }
    });
    return () => {
      unsubscribe();
      opacity.stopAnimation();
    };
  }, [opacity]);

  useLayoutEffect(() => {
    if (hasRevealed.current) return;
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

  return (
    <Animated.View pointerEvents="box-none" style={{ opacity }}>
      {children}
    </Animated.View>
  );
}
