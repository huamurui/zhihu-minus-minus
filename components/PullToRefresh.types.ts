import type { ReactElement } from 'react';

export interface PullToRefreshProps {
  children: ReactElement;
  enabled?: boolean;
  indicatorTop: number;
  onRefresh: () => void | Promise<void>;
  refreshing: boolean;
  backgroundColor: string;
  indicatorColor: string;
  indicatorTrackColor: string;
}
