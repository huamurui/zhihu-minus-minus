import { View } from 'react-native';
import type { PullToRefreshProps } from './PullToRefresh.types';

// Web fallback. Android and iOS each have a platform-specific implementation.
export function PullToRefresh({
  children,
  backgroundColor,
}: PullToRefreshProps) {
  return <View style={{ flex: 1, backgroundColor }}>{children}</View>;
}
