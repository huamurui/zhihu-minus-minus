import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface PredictiveBackCornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export interface PredictiveBackEvent {
  phase: 'start' | 'progress' | 'cancel' | 'commit';
  progress: number;
  edge: 'left' | 'right';
  routeKey: string;
  gestureId: number;
  /** Logical window corner radii in dp, sampled when the swipe starts. */
  cornerRadii?: PredictiveBackCornerRadii;
}

type Listener = (event: PredictiveBackEvent) => void;

interface PredictiveBackModule {
  setTarget(routeKey: string | null): void;
  setBackHandlerEnabled(enabled: boolean, allowHomePreview: boolean): void;
  addListener(event: 'onBackGesture', listener: Listener): { remove(): void };
}

const nativeModule =
  Platform.OS === 'android' && Platform.Version >= 33
    ? requireOptionalNativeModule<PredictiveBackModule>('ZhihuPredictiveBack')
    : null;

export function setPredictiveBackTarget(routeKey: string | null): void {
  nativeModule?.setTarget(routeKey);
}

export function setAndroidBackHandlerEnabled(
  enabled: boolean,
  allowHomePreview: boolean,
): void {
  nativeModule?.setBackHandlerEnabled(enabled, allowHomePreview);
}

export function addPredictiveBackListener(listener: Listener): {
  remove(): void;
} {
  return (
    nativeModule?.addListener('onBackGesture', listener) ?? { remove() {} }
  );
}
