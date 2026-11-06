import { getContentCollectionMetadata } from '@/api/zhihu/contentCollection';
import type { FeedItem, RawFeedItem, RawFeedTarget } from '@/api/zhihu/feed';
import {
  getContentVoteCount,
  getContentVoteState,
} from '@/api/zhihu/votePayload';

/**
 * 归一化回答的付费类型。
 *
 * `answer_type` 的大小写随接口而异——实测游客推荐流返回小写 `normal`，
 * 话题流返回大写 `NORMAL` / `PAID`。统一大写后比较，并与 `paid_info`
 * 取或作为兜底信号，避免盐选内容因大小写差异静默漏判。
 */
export function normalizeAnswerType(target: {
  answer_type?: unknown;
  paid_info?: unknown;
}): string | undefined {
  const raw =
    typeof target.answer_type === 'string'
      ? target.answer_type.toUpperCase()
      : undefined;
  if (raw === 'PAID' || target.paid_info != null) return 'PAID';
  return raw;
}

/** 只保留明确的推广卡片标记，不把投放参数或追踪 URL 带入本地 Feed 缓存。 */
function hasAdPromotion(value: unknown): boolean {
  let promotion: unknown = value;
  if (typeof value === 'string') {
    try {
      promotion = JSON.parse(value);
    } catch {
      return false;
    }
  }
  return (
    typeof promotion === 'object' &&
    promotion !== null &&
    !Array.isArray(promotion) &&
    'is_card' in promotion &&
    promotion.is_card === true
  );
}

export function parseRecommendData(item: RawFeedItem): FeedItem | null {
  const target = (item.target || item) as unknown as RawFeedTarget;
  const type = target.type;
  const stableId = target.id?.toString().trim();
  let appType: 'answers' | 'articles' | 'pins' | 'questions' | null = null;
  if (type === 'answer') appType = 'answers';
  else if (type === 'article') appType = 'articles';
  else if (type === 'pin') appType = 'pins';
  else if (type === 'question') appType = 'questions';

  if (!appType) return null;

  return {
    id: stableId || Math.random().toString(),
    isIdStable: Boolean(stableId),
    title: target.question?.title || target.title || '',
    questionId:
      target.question?.id?.toString() ||
      (type === 'question' ? target.id?.toString() : ''),
    author: {
      id: target.author?.id || '',
      url_token: target.author?.url_token || '',
      name: target.author?.name || '匿名用户',
      avatar:
        target.author?.avatar_url ||
        'https://picx.zhimg.com/v2-abed1a8c04700ba7d72b45195223e0ff_l.jpg',
      headline: target.author?.headline || '',
    },
    excerpt:
      target.excerpt ||
      (Array.isArray(target.content)
        ? target.content[0]?.content
        : target.content) ||
      '',
    content: target.content || '',
    created_time: target.created_time,
    updated_time: target.updated_time,
    ...(appType === 'answers' &&
      Array.isArray(target.endorsements) && {
        endorsements: target.endorsements,
      }),
    image:
      target.thumbnail ||
      (target.content_img && target.content_img.length > 0
        ? target.content_img[0]
        : null),
    voteCount: getContentVoteCount(appType, target) ?? 0,
    commentCount: target.comment_count || 0,
    ...getContentCollectionMetadata(target),
    voted: getContentVoteState(appType, target) ?? 0,
    type: appType,
    topics: target.topics?.map((topic) => ({
      id: topic.id,
      name: topic.name,
    })),
    // 本地过滤信号：实测推荐流可用字段（详见 utils/feedFilter.ts）
    // 盐选双信号取或：answer_type === 'PAID' 或 paid_info != null。
    // 大小写按接口而异——实测游客推荐流返回小写 `normal`，话题流返回大写
    // `NORMAL`/`PAID`，故统一大写后再比较，避免漏判。
    answerType: normalizeAnswerType(target),
    contentNeedTruncated: target.content_need_truncated,
    isAdPromotion: hasAdPromotion(item.promotion_extra),
    isLabeled: Boolean(target.is_labeled),
    isOrgAuthor: Boolean(target.author?.is_org),
    isAdvertiser: Boolean(target.author?.is_advertiser),
    isFollowingAuthor: Boolean(target.author?.is_following),
    upvotedByFollowee:
      (target.relationship?.upvoted_followee_ids?.length ?? 0) > 0,
    boundTopicIds: target.question?.bound_topic_ids,
    // question 类型 target 自身即 question，答案/文章则从嵌套 question 读取
    answerCount:
      type === 'question' ? target.answer_count : target.question?.answer_count,
    followerCount:
      type === 'question'
        ? target.follower_count
        : target.question?.follower_count,
  };
}
