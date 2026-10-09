import {
  type FeedItem,
  getContentVoteCount,
  getContentVoteState,
  type ZhihuMember,
} from '@/api/zhihu';
import type { FeedContentSegment } from '@/api/zhihu/feed';
import { Text } from '@/components/Themed';
import type {
  ZhihuSearchResultItem,
  ZhihuSearchResultObject,
} from '@/types/zhihu';
import { normalizeUserFeedType } from '@/utils/userProfile';
import { getZhihuVideoSource } from '@/utils/zhihuVideo';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** Preserve answer labels independently; only validated inline bodies may prewarm detail. */
export function getProfileFeedBody(
  value: unknown,
): Pick<
  FeedItem,
  'content' | 'answerType' | 'contentNeedTruncated' | 'endorsements'
> {
  const source = record(value);
  if (!source) return {};
  let content: FeedItem['content'];
  if (typeof source.content === 'string') content = source.content;
  else if (Array.isArray(source.content)) {
    const segments: FeedContentSegment[] = [];
    for (const value of source.content) {
      const segment = record(value);
      if (
        !segment ||
        (segment.type !== 'text' &&
          segment.type !== 'image' &&
          segment.type !== 'link_card')
      )
        break;
      const parsed: FeedContentSegment = { type: segment.type };
      let valid = true;
      for (const key of [
        'content',
        'own_text',
        'fold_type',
        'text_link_type',
        'title',
        'data_content_id',
        'data_content_type',
        'url',
        'data_draft_title',
        'data_draft_cover',
        'thumbnail',
      ] as const) {
        const field = segment[key];
        if (field !== undefined && typeof field !== 'string') {
          valid = false;
          break;
        }
        if (typeof field === 'string') parsed[key] = field;
      }
      if (!valid) break;
      for (const key of ['width', 'height'] as const) {
        const field = segment[key];
        if (
          field !== undefined &&
          (typeof field !== 'number' || !Number.isFinite(field) || field < 0)
        ) {
          valid = false;
          break;
        }
        if (typeof field === 'number') parsed[key] = field;
      }
      if (!valid) break;
      segments.push(parsed);
    }
    // Never silently seed a partial body after an unsupported or malformed part.
    if (segments.length === source.content.length) content = segments;
  }
  const answerType =
    source.paid_info != null ||
    (source.answer_type != null && typeof source.answer_type !== 'string')
      ? 'PAID'
      : typeof source.answer_type === 'string'
        ? source.answer_type.toUpperCase()
        : undefined;
  return {
    content,
    answerType,
    ...((source.type === 'answer' || source.type === 'answers') &&
      Array.isArray(source.endorsements) && {
        endorsements: source.endorsements,
      }),
    contentNeedTruncated:
      source.content_need_truncated != null
        ? source.content_need_truncated !== false
        : undefined,
  };
}

function highlightText(text: string, color: string) {
  const decoded = text
    .replace(/&lt;em&gt;/g, '<em>')
    .replace(/&lt;\/em&gt;/g, '</em>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
  return decoded.split(/(<em>.*?<\/em>)/gs).map((part, index) =>
    part.startsWith('<em>') && part.endsWith('</em>') ? (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: segments only identify fixed positions within this immutable string.
        key={index}
        style={{ color, fontWeight: '700' }}
      >
        {part.slice(4, -5)}
      </Text>
    ) : (
      part
    ),
  );
}

export function toProfileSearchFeedItem(
  result: ZhihuSearchResultItem,
  member: ZhihuMember,
  highlightColor: string,
): FeedItem | null {
  const content = result.object as
    | (ZhihuSearchResultObject & {
        favlists_count?: number;
        favorite_count?: number;
      })
    | undefined;
  if (!content || !String(content.id ?? '').trim()) return null;
  const type = normalizeUserFeedType(content.type);
  if (!type) return null;
  const title =
    content.question?.title ||
    content.question?.name ||
    content.title ||
    '无标题';
  return {
    id: String(content.id),
    type,
    videoSource: getZhihuVideoSource(content.type),
    title: result.highlight?.title
      ? highlightText(result.highlight.title, highlightColor)
      : title,
    titleString: title,
    ...getProfileFeedBody(content),
    excerpt: result.highlight?.description
      ? highlightText(result.highlight.description, highlightColor)
      : content.excerpt || '',
    image: content.thumbnail_info?.thumbnails?.[0]?.url || null,
    voteCount:
      type === 'videos' ? 0 : (getContentVoteCount(type, content) ?? 0),
    commentCount: content.comment_count || 0,
    author: {
      id: content.author?.id || member.id,
      name: content.author?.name || member.name || '匿名用户',
      avatar: content.author?.avatar_url || member.avatar_url || '',
      url_token: content.author?.url_token || member.url_token,
    },
    questionId:
      content.question?.id !== undefined
        ? String(content.question.id)
        : type === 'questions'
          ? String(content.id)
          : undefined,
    voted: type === 'videos' ? 0 : (getContentVoteState(type, content) ?? 0),
    favlistsCount: content.favlists_count || content.favorite_count || 0,
  };
}
