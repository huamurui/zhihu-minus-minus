import * as Device from 'expo-device';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { useIsTwoPaneLayout } from '@/features/adaptive-layout/PaneContext';
import type { DisplayCutoutRect } from '@/modules/display-cutout';
import { getProfileIOSIslandRect } from '@/utils/profileIOSIsland';

export function useMyProfileCutout(
  enabled: boolean,
  viewportWidth: number,
  safeTop: number,
) {
  const window = useWindowDimensions();
  const twoPane = useIsTwoPaneLayout();
  const focused = useIsFocused();
  const [androidCutout, setAndroidCutout] = useState<DisplayCutoutRect | null>(
    null,
  );
  const initialReduceMotion = useReducedMotion();
  const [reduceMotion, setReduceMotion] = useState(initialReduceMotion);
  useEffect(() => {
    let pendingRead = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (pendingRead) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        pendingRead = false;
        setReduceMotion(enabled);
      },
    );
    return () => {
      pendingRead = false;
      subscription.remove();
    };
  }, []);
  const canFuse =
    enabled &&
    focused &&
    !reduceMotion &&
    !twoPane &&
    Math.abs(viewportWidth - window.width) < 1 &&
    window.height > window.width &&
    safeTop > 0;
  useEffect(() => {
    if (!canFuse) setAndroidCutout(null);
  }, [canFuse]);
  const cutout = useMemo(() => {
    if (!canFuse) return null;
    if (Platform.OS === 'ios')
      return getProfileIOSIslandRect(
        Device.modelId,
        window.width,
        window.height,
        safeTop,
        !Device.isDevice && Platform.constants.interfaceIdiom === 'phone',
      );
    return Platform.OS === 'android' ? androidCutout : null;
  }, [canFuse, androidCutout, window.width, window.height, safeTop]);
  return {
    cutout,
    probeAndroid: canFuse && Platform.OS === 'android',
    setAndroidCutout,
  };
}
