import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, View, type ViewProps } from 'react-native';

export interface PredictiveBackEvent {
  phase: 'commit' | 'finish';
  routeKey: string;
  gestureId: number;
}

type Listener = (event: PredictiveBackEvent) => void;

interface PredictiveBackModule {
  setTarget(routeKey: string | null): void;
  setBackHandlerEnabled(enabled: boolean, allowHomePreview: boolean): void;
  releaseSurface?(gestureId: number): void;
  addListener(event: 'onBackGesture', listener: Listener): { remove(): void };
}

const moduleName = 'ZhihuPredictiveBack';
const nativeModule =
  Platform.OS === 'android' && Platform.Version >= 33
    ? requireOptionalNativeModule<PredictiveBackModule>(moduleName)
    : null;

// A module without releaseSurface uses the old JS-driven event protocol:
// it sends start/progress/cancel and never sends finish. Keep it on ordinary Back.
const previewModule =
  Platform.OS === 'android' &&
  Platform.Version >= 34 &&
  typeof nativeModule?.releaseSurface === 'function'
    ? nativeModule
    : null;
export const supportsPredictiveBack = previewModule !== null;

type BackSwipeHostProps = ViewProps & { allowContentSwipe?: boolean };

// Keep the same host type for the route's lifetime so changing eligibility
// preserves its scroll position, focused controls and in-progress drafts.
export const BackSwipeHost =
  previewModule && globalThis.expo?.getViewConfig?.(moduleName, undefined)
    ? requireNativeView<BackSwipeHostProps>(moduleName)
    : View;

export function setPredictiveBackTarget(routeKey: string | null): void {
  previewModule?.setTarget(routeKey);
}

export function predictiveBackSurfaceId(routeKey: string): string {
  return `zhihu-back-surface-${routeKey}`;
}

/** Restore the still-mounted source if navigation declined a committed gesture. */
export function releasePredictiveBackSurface(gestureId: number): void {
  previewModule?.releaseSurface?.(gestureId);
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
    previewModule?.addListener('onBackGesture', listener) ?? { remove() {} }
  );
}
