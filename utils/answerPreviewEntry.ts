import type { QueryClient } from '@tanstack/react-query';
import type { ZhihuPlainPreviewAnswer } from '@/api/zhihu/nextRender';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import type { ZhihuContentSegment, ZhihuSegmentInfo } from '@/types/zhihu';
import { seedAnswerEndorsements } from './answerEndorsements';

/** Ordinary list responses use both raw API fields and normalized feed aliases. */
export interface AnswerPreviewEntrySource {
  id: string | number;
  type?: string;
  content?: string | readonly ZhihuContentSegment[];
  question?: { id?: string | number; title?: string; titleString?: string };
  questionId?: string | number;
  title?: unknown;
  titleString?: string;
  author?: {
    id?: string | number;
    name?: string;
    fullname?: string;
    url_token?: string;
    avatar_url?: string;
    avatar?: string;
    headline?: string;
    description?: string;
  };
  excerpt?: unknown;
  endorsements?: unknown;
  voteup_count?: number;
  voteCount?: number;
  comment_count?: number;
  commentCount?: number;
  favlists_count?: number;
  favlistsCount?: number;
  voted?: number;
  is_mine?: boolean;
  relationship?: {
    voting?: number;
    is_author?: boolean;
    is_favorited?: boolean;
  };
  reaction?: {
    relation?: { vote?: string; is_author?: boolean; faved?: boolean };
    statistics?: {
      up_vote_count?: number;
      comment_count?: number;
      favorites?: number;
    };
  };
  segment_infos?: readonly ZhihuSegmentInfo[];
  link_card_info?: Readonly<Record<string, unknown>>;
  content_need_truncated?: boolean;
  contentNeedTruncated?: boolean;
  answer_type?: string;
  answerType?: string;
  paid_info?: unknown;
}

export function getAnswerPreviewEntryKey(
  answerId: string,
  sessionVersion: number,
) {
  return ['answer-preview-entry', sessionVersion, answerId] as const;
}

function identifier(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? String(value)
    : '';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Keep provided partial/paid text readable without certifying it as full detail. */
export function createAnswerPreviewEntry(
  source: AnswerPreviewEntrySource,
): ZhihuPlainPreviewAnswer | undefined {
  const id = identifier(source.id);
  const content = source.content;
  if (
    !id ||
    content === undefined ||
    (source.type !== undefined &&
      source.type !== 'answer' &&
      source.type !== 'answers') ||
    !(typeof content === 'string'
      ? content.trim().length > 0
      : Array.isArray(content) && content.length > 0)
  )
    return undefined;
  const vote = source.relationship?.voting ?? source.voted;
  const reactionVote = text(source.reaction?.relation?.vote).toLowerCase();
  const rawAnswerType = text(
    source.answer_type ?? source.answerType,
  ).toUpperCase();
  const answerType =
    source.paid_info != null ? 'PAID' : rawAnswerType || undefined;
  return {
    id,
    type: 'answer',
    content,
    question: {
      id: identifier(source.question?.id ?? source.questionId),
      title: text(
        source.question?.title ??
          source.question?.titleString ??
          source.titleString ??
          source.title,
      ),
    },
    author: {
      id: identifier(source.author?.id),
      name: text(source.author?.name ?? source.author?.fullname) || '未知作者',
      url_token: text(source.author?.url_token),
      avatar_url: text(source.author?.avatar_url ?? source.author?.avatar),
      headline: text(source.author?.headline ?? source.author?.description),
    },
    excerpt: text(source.excerpt),
    ...(Array.isArray(source.endorsements) && {
      endorsements: source.endorsements,
    }),
    voteup_count: count(
      source.voteup_count ??
        source.voteCount ??
        source.reaction?.statistics?.up_vote_count,
    ),
    comment_count: count(
      source.comment_count ??
        source.commentCount ??
        source.reaction?.statistics?.comment_count,
    ),
    favlists_count: count(
      source.favlists_count ??
        source.favlistsCount ??
        source.reaction?.statistics?.favorites,
    ),
    relationship: {
      is_author:
        source.relationship?.is_author === true ||
        source.is_mine === true ||
        source.reaction?.relation?.is_author === true,
      is_favorited:
        source.relationship?.is_favorited === true ||
        source.reaction?.relation?.faved === true,
      voting:
        vote === 1 || (vote === undefined && reactionVote === 'up')
          ? 1
          : vote === -1 || (vote === undefined && reactionVote === 'down')
            ? -1
            : 0,
    },
    segmentInfos: source.segment_infos,
    linkCardInfo: source.link_card_info,
    contentNeedTruncated:
      source.content_need_truncated ?? source.contentNeedTruncated,
    answerType,
  };
}

/** Click-scoped cache only; never seed partial content into answer-detail. */
export function seedAnswerPreviewEntry(
  queryClient: QueryClient,
  source: AnswerPreviewEntrySource,
): void {
  if (
    source.type === undefined ||
    source.type === 'answer' ||
    source.type === 'answers'
  ) {
    seedAnswerEndorsements(queryClient, source);
  }
  const entry = createAnswerPreviewEntry(source);
  if (!entry) return;
  queryClient.setQueryData(
    getAnswerPreviewEntryKey(entry.id, getAuthSessionVersion()),
    entry,
  );
}
