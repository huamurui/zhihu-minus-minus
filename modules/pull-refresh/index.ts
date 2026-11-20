import { requireNativeView } from 'expo';
import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

// The last interval ends at the separate release-to-refresh confirmation.
const HAPTIC_TICK_COUNT = 42;
export const PULL_HAPTIC_TICK_POSITIONS = Array.from(
  { length: HAPTIC_TICK_COUNT },
  (_, index) => (index + 1) / (HAPTIC_TICK_COUNT + 1),
);

export interface PullRefreshEventData {
  offset: number;
  progress: number;
  dragging: boolean;
}

export interface PullRefreshNativeEvent extends PullRefreshEventData {
  eventName: string;
}

interface PullRefreshNativeViewProps extends ViewProps {
  children?: ReactNode;
  enabled: boolean;
  hapticsEnabled: boolean;
  /** iOS progress haptics, as fractions of the refresh threshold. */
  hapticTickPositions?: number[];
  refreshing: boolean;
  threshold: number;
  holdDistance: number;
  maxPullDistance: number;
  onPull?: (event: PullRefreshNativeEvent) => void;
  onRefreshTriggered?: () => void;
}

export const PullRefreshNativeView =
  requireNativeView<PullRefreshNativeViewProps>('PullRefresh');
