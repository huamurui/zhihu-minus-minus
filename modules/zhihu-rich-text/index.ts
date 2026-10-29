import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { type ComponentType, createElement } from 'react';
import { Platform, type ViewProps } from 'react-native';

export interface RichTextSelectionEventData {
  readonly flowId: string;
  readonly textVersion: string;
  readonly start: number;
  readonly end: number;
}

export interface RichTextHeightEventData {
  readonly flowId: string;
  readonly textVersion: string;
  readonly layoutKey: string;
  readonly height: number;
  /** Native-clock durations, present only when performance tracing is enabled. */
  readonly nativeMeasureMs?: number | null;
  readonly nativePropsToMeasureMs?: number | null;
  readonly nativePropsToSizeRequestMs?: number | null;
  readonly nativePropsToDispatchMs?: number | null;
  readonly nativeRebuildMs?: number | null;
  readonly nativeSuperMeasureMs?: number | null;
  readonly nativeParseMs?: number | null;
  readonly nativeSpannableMs?: number | null;
  readonly nativeSetTextMs?: number | null;
  readonly measureCount?: number;
  readonly setViewSizeCount?: number;
  readonly schedulePostWaitMs?: number | null;
  readonly heightPostWaitMs?: number | null;
  readonly nativePropsSetEpochMs?: number | null;
  readonly nativeFirstMeasureEpochMs?: number | null;
  readonly nativeFirstLayoutEpochMs?: number | null;
  readonly nativeDispatchEpochMs?: number | null;
}

export interface RichTextActionEventData extends RichTextSelectionEventData {
  readonly kind: 'link' | 'segment' | 'attachment' | 'attachmentLongPress';
  readonly id: string;
  readonly url?: string;
}

/** Expo view events use nativeEvent; the flat shape supports existing callers. */
export type RichTextNativeEvent<T> = T & { readonly nativeEvent?: T };

export interface RichTextNativeViewProps extends ViewProps {
  readonly flowJson: string;
  readonly configJson: string;
  readonly contentWidth: number;
  readonly layoutKey: string;
  readonly selectable: boolean;
  /** Opt-in experiment: the native view updates its Fabric size. */
  readonly nativeAutoSize?: boolean;
  readonly performanceTracing?: boolean;
  /** Reserve double taps for a host gesture, keeping long-press selection. */
  readonly suppressDoubleTapSelection?: boolean;
  readonly onSelectionChange?: (
    event: RichTextNativeEvent<RichTextSelectionEventData>,
  ) => void;
  readonly onHeightChange?: (
    event: RichTextNativeEvent<RichTextHeightEventData>,
  ) => void;
  readonly onAction?: (
    event: RichTextNativeEvent<RichTextActionEventData>,
  ) => void;
}

let nativeView: ComponentType<RichTextNativeViewProps> | null | undefined;

function getNativeView(): ComponentType<RichTextNativeViewProps> | null {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return null;
  if (nativeView !== undefined) return nativeView;
  try {
    nativeView = requireOptionalNativeModule('ZhihuRichText')
      ? requireNativeView<RichTextNativeViewProps>('ZhihuRichText')
      : null;
  } catch {
    nativeView = null;
  }
  return nativeView;
}

export function isRichTextNativeAvailable(): boolean {
  return getNativeView() !== null;
}

/** Native flow view; callers choose their fallback on unsupported clients. */
export function RichTextNativeView(props: RichTextNativeViewProps) {
  const NativeView = getNativeView();
  return NativeView ? createElement(NativeView, props) : null;
}
