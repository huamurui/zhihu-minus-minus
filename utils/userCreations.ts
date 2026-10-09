import type { FeedItem } from '@/api/zhihu/feed';
import type {
  ZhihuListResponse,
  ZhihuMember,
  ZhihuMemberActivity,
} from '@/api/zhihu/member';
import {
  getContentVoteCount,
  getContentVoteState,
} from '@/api/zhihu/votePayload';
import {
  getNextRecentActivityCursor,
  getRecentActivityTargetId,
  normalizeUserFeedType,
  type RecentActivityCursor,
} from './userProfile';
import { getZhihuVideoSource } from './zhihuVideo';

export type UserCreationsPage = ZhihuListResponse<ZhihuMemberActivity>;
// null means "now", resolved when the request starts, including after refresh.
export type UserCreationsPageParam = RecentActivityCursor | null;

export function getNextUserCreationsCursor(
  lastPage: UserCreationsPage,
  lastCursor: UserCreationsPageParam,
  cursors: UserCreationsPageParam[],
): RecentActivityCursor | undefined {
  if (lastPage.paging?.is_end || lastPage.data.length === 0) return undefined;
  const next = getNextRecentActivityCursor(lastPage.paging?.next);
  if (!next || next.pageNum <= (lastCursor?.pageNum ?? 1)) return undefined;
  if (lastCursor && next.offset > lastCursor.offset) return undefined;
  return cursors.some(
    (cursor) =>
      cursor?.offset === next.offset && cursor.pageNum === next.pageNum,
  )
    ? undefined
    : next;
}

/** Keep one card per creation even when adjacent pages overlap. */
export function deduplicateUserCreations(
  activities: ZhihuMemberActivity[],
): ZhihuMemberActivity[] {
  const seen = new Set<string>();
  return activities.filter((activity) => {
    const target = activity.target;
    const id = target && getRecentActivityTargetId(target);
    const type = normalizeUserFeedType(target?.type);
    const key =
      id !== undefined && type
        ? `content:${type}:${id}`
        : activity.id !== undefined
          ? `activity:${activity.id}`
          : undefined;
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCreationExcerpt(
  target: NonNullable<ZhihuMemberActivity['target']>,
): string {
  const text = Array.isArray(target.content)
    ? target.content
        .filter((segment) => segment.type === 'text')
        .map((segment) => segment.content || segment.own_text || '')
        .join('')
    : target.excerpt || target.excerpt_title || target.content || '';
  return typeof text === 'string'
    ? text.replace(/<[^>]+>/g, '').slice(0, 150)
    : '';
}

export function toUserCreationFeedItem(
  activity: ZhihuMemberActivity,
  member: ZhihuMember,
): FeedItem | null {
  const target = activity.target;
  if (!target) return null;
  const id = getRecentActivityTargetId(target);
  const type = normalizeUserFeedType(target.type);
  if (id === undefined || id === '' || !type) return null;

  const contentImage = Array.isArray(target.content)
    ? target.content.find((segment) => segment.type === 'image')
    : undefined;
  const author = target.author;

  return {
    id: String(id),
    title: target.question?.title || target.title || '',
    actionText: activity.source?.action_text,
    questionId:
      target.question?.id !== undefined
        ? String(target.question.id)
        : type === 'questions'
          ? String(id)
          : undefined,
    author: {
      id: author?.id || member.id,
      url_token: author?.url_token || member.url_token,
      name: author?.name || member.name,
      avatar: author?.avatar_url || member.avatar_url,
      headline: author?.headline || member.headline,
    },
    excerpt: getCreationExcerpt(target),
    content: target.content,
    ...(type === 'answers' &&
      Array.isArray(target.endorsements) && {
        endorsements: target.endorsements,
      }),
    image:
      target.image_url ||
      target.thumbnail ||
      contentImage?.url ||
      contentImage?.data_draft_cover ||
      null,
    voteCount: type === 'videos' ? 0 : (getContentVoteCount(type, target) ?? 0),
    commentCount:
      target.comment_count ?? target.reaction?.statistics?.comments ?? 0,
    favlistsCount:
      target.favlists_count ??
      target.favorite_count ??
      target.reaction?.statistics?.favorites ??
      0,
    voted: type === 'videos' ? 0 : (getContentVoteState(type, target) ?? 0),
    type,
    videoSource: getZhihuVideoSource(target.type),
  };
}
