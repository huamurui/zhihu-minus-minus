import { requireNativeView } from 'expo';
import type { ReactNode } from 'react';
import type { ViewProps } from 'react-native';

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
  refreshing: boolean;
  threshold: number;
  holdDistance: number;
  maxPullDistance: number;
  onPull?: (event: PullRefreshNativeEvent) => void;
  onRefreshTriggered?: () => void;
}

export const PullRefreshNativeView =
  requireNativeView<PullRefreshNativeViewProps>('ZhihuPullRefresh');
