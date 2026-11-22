import { useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { setAndroidBackHandlerEnabled } from '@/modules/predictive-back';
import { useSettingsStore } from '@/store/useSettingsStore';
import { shouldUseTwoPanes } from './layout';

/** Let Android handle back-to-home when no navigator can consume a return. */
export function AndroidBackNavigation() {
  const navigation = useNavigationContainerRef();
  const { width } = useWindowDimensions();
  const mode = useSettingsStore((s) => s.largeScreenLayoutMode);
  const enabled = useSettingsStore((s) => s.androidPredictiveBackEnabled);
  const allowHomePreview =
    Number(Platform.Version) >= 34 &&
    enabled &&
    !shouldUseTwoPanes(mode, width);
  useEffect(() => {
    let mounted = true;
    const sync = () => {
      // Expo emits state during layout. Read after nested navigators have
      // registered their focused route, including on an initial deep link.
      queueMicrotask(() => {
        if (mounted) {
          setAndroidBackHandlerEnabled(
            navigation.current?.canGoBack() ?? false,
            allowHomePreview,
          );
        }
      });
    };
    const unsubscribe = navigation.addListener('state', sync);
    sync();
    return () => {
      mounted = false;
      unsubscribe();
      setAndroidBackHandlerEnabled(false, false);
    };
  }, [navigation, allowHomePreview]);
  return null;
}
