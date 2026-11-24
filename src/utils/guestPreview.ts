import type { QueryClient } from '@tanstack/react-query';
import type { FeedItem } from '@/api/zhihu';

export function guestPreviewBodyKey(
  session: number,
  type?: string,
  id?: string,
) {
  return ['guest-preview-body', session, type, id] as const;
}

/** Keep native navigation state small. A restored route can still show the public excerpt. */
export function createGuestPreviewParams(
  client: QueryClient,
  item: FeedItem,
  session: number,
  platform: string,
) {
  const summary = {
    id: item.id,
    type: item.type,
    title: typeof item.title === 'string' ? item.title : item.titleString || '',
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : '',
    author: item.author,
    image: item.image,
    voteCount: item.voteCount,
    commentCount: item.commentCount,
    rank: item.rank,
    hotValue: item.hotValue,
  };
  // Web links must survive reload, and unstable IDs cannot address cached bodies.
  if (
    platform === 'web' ||
    !item.content ||
    !item.id ||
    item.isIdStable === false
  ) {
    return { item: JSON.stringify({ ...summary, content: item.content }) };
  }
  client.setQueryData(
    guestPreviewBodyKey(session, item.type, item.id),
    item.content,
  );
  return { item: JSON.stringify(summary), bodySession: String(session) };
}
