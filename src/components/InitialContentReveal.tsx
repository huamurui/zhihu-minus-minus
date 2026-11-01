import { type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';

let cachedReduceMotion = false;
let isReduceMotionResolved = false;
let subscriptionEpoch = 0;
let subscriptionCount = 0;
let removeNativeListener: (() => void) | null = null;
const listeners = new Set<(enabled: boolean, resolved: boolean) => void>();

function subscribeReduceMotion(
  callback: (enabled: boolean, resolved: boolean) => void,
): () => void {
  listeners.add(callback);
  callback(cachedReduceMotion, isReduceMotionResolved);

  if (subscriptionCount === 0) {
    const currentEpoch = ++subscriptionEpoch;
    let hasEventUpdate = false;

    void AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then?.((enabled) => {
        if (currentEpoch !== subscriptionEpoch || hasEventUpdate) return;
        cachedReduceMotion = Boolean(enabled);
        isReduceMotionResolved = true;
        for (const listener of listeners) {
          listener(cachedReduceMotion, isReduceMotionResolved);
        }
      })
      ?.catch?.(() => {
        if (currentEpoch !== subscriptionEpoch || hasEventUpdate) return;
        isReduceMotionResolved = true;
        for (const listener of listeners) {
          listener(cachedReduceMotion, isReduceMotionResolved);
        }
      });

    const subscription = AccessibilityInfo.addEventListener?.(
      'reduceMotionChanged',
      (enabled) => {
        if (currentEpoch !== subscriptionEpoch) return;
        hasEventUpdate = true;
        cachedReduceMotion = Boolean(enabled);
        isReduceMotionResolved = true;
        for (const listener of listeners) {
          listener(cachedReduceMotion, isReduceMotionResolved);
        }
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

export function setCachedReduceMotionForTest(value: boolean, resolved = true) {
  cachedReduceMotion = value;
  isReduceMotionResolved = resolved;
  for (const listener of listeners) {
    listener(value, resolved);
  }
}

export function resetReduceMotionSubscriptionForTest() {
  removeNativeListener?.();
  removeNativeListener = null;
  subscriptionEpoch++;
  subscriptionCount = 0;
  isReduceMotionResolved = false;
  cachedReduceMotion = false;
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
  const isResolved = useRef(isReduceMotionResolved);
  const shouldAnimate = isResolved.current && !reduceMotion.current;
  const initialOpacity = ready && shouldAnimate ? 0 : 1;
  const opacity = useRef(new Animated.Value(initialOpacity)).current;
  const hasRevealed = useRef(ready && !shouldAnimate);

  useEffect(() => {
    const unsubscribe = subscribeReduceMotion((enabled, resolved) => {
      reduceMotion.current = enabled;
      isResolved.current = resolved;
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
    if (!isResolved.current || reduceMotion.current) {
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
