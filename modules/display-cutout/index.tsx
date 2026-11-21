import { requireNativeView, requireOptionalNativeModule } from 'expo';
import {
  type NativeSyntheticEvent,
  Platform,
  StyleSheet,
  type ViewProps,
} from 'react-native';
import {
  type CutoutMeasurement,
  type DisplayCutoutRect,
  getCameraHole,
} from './cameraHole';

export type { DisplayCutoutRect } from './cameraHole';

interface ProbeProps extends ViewProps {
  onMeasurement: (event: NativeSyntheticEvent<CutoutMeasurement>) => void;
}

const NativeProbe =
  Platform.OS === 'android' &&
  Platform.Version >= 28 &&
  requireOptionalNativeModule('ZhihuDisplayCutout')
    ? requireNativeView<ProbeProps>('ZhihuDisplayCutout')
    : null;

/** Mount at the origin of the fixed viewport used for the avatar animation. */
export function AndroidDisplayCutoutProbe({
  onChange,
}: {
  onChange: (rect: DisplayCutoutRect | null) => void;
}) {
  if (!NativeProbe) return null;
  return (
    <NativeProbe
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      onMeasurement={({ nativeEvent }) => onChange(getCameraHole(nativeEvent))}
    />
  );
}
