import type { QueryClient } from '@tanstack/react-query';
import type { FeedItem } from '@/api/zhihu';
import {
  getRichContentQueryKey,
  hasInlineRichContent,
} from '@/features/rich-content';

export type CachedContentType = 'answers' | 'articles' | 'pins' | 'questions';

export interface ContentInteractionUpdate {
  type: CachedContentType;
  id: string | number;
  voted?: number;
  voteCount?: number;
  isCollected?: boolean;
}

type ObjectRecord = Record<string, unknown>;

function isObjectRecord(value: unknown): value is ObjectRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSingularType(type: CachedContentType): string {
  return type.slice(0, -1);
}

function isMatchingContentRecord(
  value: ObjectRecord,
  type: CachedContentType,
  id: string,
): boolean {
  return (
    String(value.id ?? '') === id &&
    (value.type === type || value.type === getSingularType(type))
  );
}

function setIfChanged(
  target: ObjectRecord,
  key: string,
  value: unknown,
): boolean {
  if (target[key] === value) return false;
  target[key] = value;
  return true;
}

function updateContentRecord(
  value: unknown,
  update: ContentInteractionUpdate,
  requireMatchingType: boolean,
): unknown {
  if (!isObjectRecord(value)) return value;

  const id = String(update.id);
  if (requireMatchingType && !isMatchingContentRecord(value, update.type, id)) {
    return value;
  }
  if (!requireMatchingType && String(value.id ?? '') !== id) return value;

  const next: ObjectRecord = { ...value };
  let changed = false;

  if (update.voted !== undefined) {
    const isNormalizedFeedItem = value.type === update.type;
    if (isNormalizedFeedItem) {
      changed = setIfChanged(next, 'voted', update.voted) || changed;
      if (update.voteCount !== undefined) {
        changed = setIfChanged(next, 'voteCount', update.voteCount) || changed;
      }
    } else {
      const relationship = isObjectRecord(value.relationship)
        ? { ...value.relationship }
        : {};
      changed = setIfChanged(relationship, 'voting', update.voted) || changed;
      changed = setIfChanged(next, 'relationship', relationship) || changed;

      const reaction = isObjectRecord(value.reaction)
        ? { ...value.reaction }
        : {};
      const relation = isObjectRecord(reaction.relation)
        ? { ...reaction.relation }
        : {};
      changed =
        setIfChanged(relation, 'vote', update.voted === 1 ? 'UP' : 'NEUTRAL') ||
        changed;
      changed = setIfChanged(reaction, 'relation', relation) || changed;
      changed = setIfChanged(next, 'reaction', reaction) || changed;

      if (update.voteCount !== undefined) {
        // Different Zhihu endpoints use different names for the same count.
        if ('voteup_count' in value || update.type !== 'pins') {
          changed =
            setIfChanged(next, 'voteup_count', update.voteCount) || changed;
        }
        if ('like_count' in value || update.type === 'pins') {
          changed =
            setIfChanged(next, 'like_count', update.voteCount) || changed;
        }
        if ('reaction_count' in value || update.type === 'pins') {
          changed =
            setIfChanged(next, 'reaction_count', update.voteCount) || changed;
        }
        if ('voting' in value) {
          changed = setIfChanged(next, 'voting', update.voted) || changed;
        }
      }

      if (
        update.voteCount !== undefined &&
        isObjectRecord(reaction.statistics)
      ) {
        const statistics = { ...reaction.statistics };
        if ('like_count' in statistics) {
          changed =
            setIfChanged(statistics, 'like_count', update.voteCount) || changed;
        }
        if ('up_vote_count' in statistics) {
          changed =
            setIfChanged(statistics, 'up_vote_count', update.voteCount) ||
            changed;
        }
        changed = setIfChanged(reaction, 'statistics', statistics) || changed;
      }
    }
  }

  if (
    update.isCollected !== undefined &&
    !isNormalizedFeedItem(value, update)
  ) {
    const relationship = isObjectRecord(next.relationship)
      ? { ...next.relationship }
      : {};
    const reaction = isObjectRecord(next.reaction) ? { ...next.reaction } : {};
    const relation = isObjectRecord(reaction.relation)
      ? { ...reaction.relation }
      : {};
    changed =
      setIfChanged(relationship, 'is_favorited', update.isCollected) || changed;
    changed = setIfChanged(next, 'relationship', relationship) || changed;
    changed = setIfChanged(relation, 'faved', update.isCollected) || changed;
    changed = setIfChanged(reaction, 'relation', relation) || changed;
    changed = setIfChanged(next, 'reaction', reaction) || changed;
  }

  return changed ? next : value;
}

function isNormalizedFeedItem(
  value: ObjectRecord,
  update: ContentInteractionUpdate,
): boolean {
  return value.type === update.type && 'voteCount' in value;
}

function updateNestedCacheValue(
  value: unknown,
  update: ContentInteractionUpdate,
): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const updated = updateNestedCacheValue(item, update);
      changed = updated !== item || changed;
      return updated;
    });
    return changed ? next : value;
  }
  if (!isObjectRecord(value)) return value;

  let next: ObjectRecord = value;
  const updatedSelf = updateContentRecord(value, update, true);
  if (updatedSelf !== value) next = updatedSelf as ObjectRecord;

  for (const [key, child] of Object.entries(next)) {
    const updatedChild = updateNestedCacheValue(child, update);
    if (updatedChild !== child) {
      if (next === value) next = { ...value };
      next[key] = updatedChild;
    }
  }
  return next;
}

/**
 * Write a card's already-loaded body into the same cache used by its detail
 * screen. Existing detail data is deliberately preserved: it may contain a
 * newer interaction state produced by the user a moment ago.
 */
export function seedRichContentFromFeedItem(
  queryClient: QueryClient,
  item: FeedItem,
  isAuthenticated = false,
): void {
  if (
    item.type === 'videos' ||
    !hasInlineRichContent(item.content) ||
    (item.type === 'answers' &&
      (!item.questionId ||
        item.answerType === 'PAID' ||
        item.contentNeedTruncated === true))
  ) {
    return;
  }

  const title =
    item.titleString || (typeof item.title === 'string' ? item.title : '');
  const contentType = item.type;
  const key = getRichContentQueryKey(
    contentType,
    String(item.id),
    isAuthenticated,
  );
  const content = item.content;
  const common = {
    id: item.id,
    type: getSingularType(contentType),
    content,
    excerpt: typeof item.excerpt === 'string' ? item.excerpt : undefined,
    title,
    author: {
      id: item.author.id,
      name: item.author.name,
      avatar_url: item.author.avatar,
      url_token: item.author.url_token,
      type: 'people',
    },
    comment_count: item.commentCount,
    voteup_count: item.voteCount,
    like_count: item.voteCount,
    reaction_count: item.voteCount,
    favlists_count: item.favlistsCount,
    relationship: { voting: item.voted },
  } satisfies ObjectRecord;

  const seed =
    contentType === 'questions'
      ? {
          ...common,
          detail: typeof content === 'string' ? content : undefined,
          question: undefined,
        }
      : contentType === 'answers'
        ? {
            ...common,
            question: item.questionId
              ? { id: item.questionId, title, type: 'question' }
              : undefined,
          }
        : common;

  if (queryClient.getQueryData(key) !== undefined) return;

  // Card data is enough to paint the body immediately, but it may not contain
  // metadata used by the detail screen. Mark this synthetic entry stale so a
  // detail screen can refresh it in the background without losing the fast
  // first paint.
  queryClient.setQueryData(key, seed, { updatedAt: 0 });
}

export function updateContentInteractionCaches(
  queryClient: QueryClient,
  update: ContentInteractionUpdate,
): void {
  const id = String(update.id);
  const canonicalKey = getRichContentQueryKey(update.type, id);
  queryClient.setQueryData(canonicalKey, (existing: unknown) =>
    updateContentRecord(existing, update, false),
  );

  for (const [queryKey] of queryClient.getQueriesData<unknown>({})) {
    queryClient.setQueryData(queryKey, (existing: unknown) =>
      updateNestedCacheValue(existing, update),
    );
  }
}
