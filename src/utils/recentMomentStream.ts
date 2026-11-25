import type { RecentMomentItem } from '@/api/zhihu/moments';
import { normalizeRecentMoments } from './recentMoments';

export interface RecentMomentStreamEntry {
  id: string;
  unreadCount: number;
  moment?: RecentMomentItem;
}

function parseUnreadCount(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

/** Snapshot the strip, preserving the selected user even if its cache is gone. */
export function createRecentMomentStream(
  initialId: string,
  unreadCount: string | undefined,
  moments: unknown = [],
): { entries: RecentMomentStreamEntry[]; initialPage: number } {
  const entries: RecentMomentStreamEntry[] = [];
  const seen = new Set<string>();
  let initialPage = -1;
  for (const moment of normalizeRecentMoments(moments)) {
    const id = moment.actor.url_token || moment.actor.id;
    const identity = moment.actor.id || id;
    if (!id || seen.has(identity)) continue;
    seen.add(identity);
    const selected = initialId === id || initialId === moment.actor.id;
    if (selected) initialPage = entries.length;
    entries.push({
      id,
      unreadCount: selected
        ? parseUnreadCount(unreadCount)
        : Math.max(0, moment.unread_count),
      moment,
    });
  }
  if (initialPage < 0) {
    entries.unshift({
      id: initialId,
      unreadCount: parseUnreadCount(unreadCount),
    });
    initialPage = 0;
  }
  return { entries, initialPage };
}
