import {
  parseStructuredContentPaging,
  parseZhihuStructuredContent,
} from '@/features/rich-content';
import { getAuthSessionVersion } from '@/store/useAuthStore';
import type {
  ZhihuContentSegment,
  ZhihuSegmentInfo,
  ZhihuStructuredContent,
} from '@/types/zhihu';
import apiClient, { type ApiRequestOptions } from '../client';
import { getZhihuAppEndpointHeaders } from './appApi';
import type {
  ZhihuNextRenderPaging,
  ZhihuNextRenderParams,
} from './nextRender';

export interface ZhihuPreviewAnswerMetadata {
  id: string;
  type: 'answer';
  question: { id: string; title: string };
  author: {
    id: string;
    name: string;
    url_token: string;
    avatar_url: string;
    headline: string;
  };
  excerpt: string;
  endorsements?: readonly unknown[];
  voteup_count: number;
  comment_count: number;
  favlists_count: number;
  relationship: {
    is_author: boolean;
    is_favorited: boolean;
    voting: -1 | 0 | 1;
  };
}

export interface ZhihuPreviewAnswer extends ZhihuPreviewAnswerMetadata {
  structuredContent: ZhihuStructuredContent;
}

export interface ZhihuPlainPreviewAnswer extends ZhihuPreviewAnswerMetadata {
  content: string | readonly ZhihuContentSegment[];
  segmentInfos?: readonly ZhihuSegmentInfo[];
  linkCardInfo?: Readonly<Record<string, unknown>>;
  contentNeedTruncated?: boolean;
  answerType?: string;
}

export interface ZhihuPreviewLoginPrompt {
  id: string;
  type: 'login_prompt';
  description: string;
}

export type ZhihuAnswerPreviewItem =
  | ZhihuPreviewAnswer
  | ZhihuPreviewLoginPrompt;

export type ZhihuReadingPreviewItem =
  | ZhihuPreviewAnswer
  | ZhihuPlainPreviewAnswer
  | ZhihuPreviewLoginPrompt;

export interface ZhihuAnswerPreviewPage {
  data: ZhihuAnswerPreviewItem[];
  paging: ZhihuNextRenderPaging;
}

export interface ZhihuPreviewRequestOptions extends ApiRequestOptions {
  sessionVersion?: number;
}

export interface ZhihuRenderContinuation {
  next?: string;
  error?: string;
}

const INVALID_RESPONSE = '回答预览返回结构无效';
const INVALID_CONTINUATION = '回答预览分页地址无效';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function identifier(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
    return String(value);
  throw new Error(INVALID_RESPONSE);
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

/** Preserve server query parameters while limiting credential-bearing requests. */
export function validateZhihuRenderUrl(
  value: string,
  path: '/next-render' | '/next-content-render',
): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(INVALID_CONTINUATION);
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'api.zhihu.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.hash ||
    url.pathname !== path
  )
    throw new Error(INVALID_CONTINUATION);
  return value;
}

function continuationIdentity(value: string): string {
  const url = new URL(value);
  url.searchParams.sort();
  return url.toString();
}

function normalizePaging(value: unknown): ZhihuNextRenderPaging {
  const paging = record(value);
  if (!paging || typeof paging.is_end !== 'boolean')
    throw new Error(INVALID_RESPONSE);
  return {
    is_end: paging.is_end,
    is_start: paging.is_start === true,
    next: text(paging.next),
    previous: text(paging.previous),
    totals: count(paging.totals),
  };
}

function normalizeAnswer(value: Record<string, unknown>): ZhihuPreviewAnswer {
  const author = record(value.author);
  const avatar = record(record(author?.avatar)?.avatar_image);
  const question = record(value.question);
  const reaction = record(value.reaction);
  const statistics = record(reaction?.statistics);
  const relation = record(reaction?.relation);
  const vote = text(relation?.vote).toLowerCase();
  const structuredContent = parseZhihuStructuredContent(
    value.structured_content,
  );
  return {
    id: identifier(value.id),
    type: 'answer',
    question: { id: text(question?.id), title: text(question?.title) },
    author: {
      id: text(author?.id),
      name: text(author?.fullname) || '未知作者',
      url_token: text(author?.url_token),
      avatar_url: text(avatar?.day) || text(avatar?.night),
      headline: text(author?.description),
    },
    excerpt: text(value.excerpt),
    ...(Array.isArray(value.endorsements) && {
      endorsements: value.endorsements,
    }),
    voteup_count: count(statistics?.up_vote_count),
    comment_count: count(statistics?.comment_count),
    favlists_count: count(statistics?.favorites),
    relationship: {
      is_author: value.is_mine === true || relation?.is_author === true,
      is_favorited: relation?.faved === true,
      voting: vote === 'up' ? 1 : vote === 'down' ? -1 : 0,
    },
    structuredContent,
  };
}

export function normalizeZhihuAnswerPreviewPage(
  value: unknown,
): ZhihuAnswerPreviewPage {
  const response = record(value);
  if (!response || !Array.isArray(response.data))
    throw new Error(INVALID_RESPONSE);
  const data = response.data.flatMap((entry): ZhihuAnswerPreviewItem[] => {
    const item = record(entry);
    if (!item) throw new Error(INVALID_RESPONSE);
    if (item.type === 'answer') {
      try {
        return [normalizeAnswer(item)];
      } catch {
        // An unusable answer must not discard valid cards from the same page.
        return [];
      }
    }
    if (item.type === 'login_prompt')
      return [
        {
          id: identifier(item.id),
          type: 'login_prompt',
          description: text(item.description),
        },
      ];
    // Unobserved feed decorations have no known answer body or interaction model.
    return [];
  });
  return { data, paging: normalizePaging(response.paging) };
}

export function buildZhihuNextRenderUrl(params: ZhihuNextRenderParams): string {
  const url = new URL('https://api.zhihu.com/next-render');
  url.searchParams.set('id', params.id);
  url.searchParams.set('type', 'answer');
  url.searchParams.set('scenes', params.scenes ?? 'unknown');
  if (params.scenes === 'question_feed') {
    url.searchParams.set('collection_id', params.collection_id);
    url.searchParams.set('collection_type', 'question');
    url.searchParams.set(
      'question_feed_session_id',
      params.question_feed_session_id,
    );
    url.searchParams.set('question_feed_cursor', params.question_feed_cursor);
  }
  url.searchParams.set('context_expand', String(params.context_expand));
  url.searchParams.set('is_native', String(params.is_native));
  return url.toString();
}

async function getRenderResponse(
  url: string,
  path: '/next-render' | '/next-content-render',
  options: ZhihuPreviewRequestOptions = {},
): Promise<unknown> {
  const sessionVersion = options.sessionVersion ?? getAuthSessionVersion();
  if (sessionVersion !== getAuthSessionVersion())
    throw new Error('登录状态已变化');
  const safeUrl = validateZhihuRenderUrl(url, path);
  const response = await apiClient.get<unknown>(safeUrl, {
    signal: options.signal,
    headers: getZhihuAppEndpointHeaders(safeUrl),
  });
  if (sessionVersion !== getAuthSessionVersion())
    throw new Error('登录状态已变化');
  return response.data;
}

export async function getNextRender(
  params: ZhihuNextRenderParams | string,
  options?: ZhihuPreviewRequestOptions,
): Promise<ZhihuAnswerPreviewPage> {
  const url =
    typeof params === 'string' ? params : buildZhihuNextRenderUrl(params);
  return normalizeZhihuAnswerPreviewPage(
    await getRenderResponse(url, '/next-render', options),
  );
}

export async function getNextContentRender(
  url: string,
  options?: ZhihuPreviewRequestOptions,
): Promise<ZhihuStructuredContent> {
  const response = await getRenderResponse(
    url,
    '/next-content-render',
    options,
  );
  // No real continuation body was captured. Validate the direct body or its
  // explicit structured_content envelope; other shapes remain a visible error.
  return parseZhihuStructuredContent(
    record(response)?.structured_content ?? response,
  );
}

function continuation(
  isEnd: boolean,
  next: string,
  path: '/next-render' | '/next-content-render',
  pageParams: readonly unknown[],
): ZhihuRenderContinuation {
  if (isEnd) return {};
  try {
    const safeUrl = validateZhihuRenderUrl(next, path);
    const identity = continuationIdentity(safeUrl);
    if (
      pageParams.some(
        (parameter) =>
          typeof parameter === 'string' &&
          continuationIdentity(parameter) === identity,
      )
    )
      return { error: '分页地址重复，已停止继续加载' };
    return { next: safeUrl };
  } catch {
    return { error: INVALID_CONTINUATION };
  }
}

export function getAnswerPreviewContinuation(
  pages: readonly ZhihuAnswerPreviewPage[],
  pageParams: readonly unknown[],
): ZhihuRenderContinuation {
  const latest = pages[pages.length - 1];
  if (!latest) return {};
  const result = continuation(
    latest.paging.is_end,
    latest.paging.next,
    '/next-render',
    pageParams,
  );
  if (!result.next) return result;
  const previousIds = new Set(
    pages.slice(0, -1).flatMap((page) => page.data.map((item) => item.id)),
  );
  if (
    !latest.data.some(
      (item) => item.type === 'answer' && !previousIds.has(item.id),
    )
  )
    return { error: '回答分页没有新增回答，已停止继续加载' };
  return result;
}

export function getStructuredContentContinuation(
  pages: readonly ZhihuStructuredContent[],
  pageParams: readonly unknown[],
): ZhihuRenderContinuation {
  const latest = pages[pages.length - 1];
  if (!latest) return {};
  let result: ZhihuRenderContinuation;
  try {
    const paging = parseStructuredContentPaging(latest.paging);
    result = continuation(
      paging.is_end,
      paging.next,
      '/next-content-render',
      pageParams,
    );
  } catch {
    return { error: '正文分页返回结构无效' };
  }
  if (!result.next) return result;
  const previousSegments = new Map(
    pages
      .slice(0, -1)
      .flatMap((page) => page.segments)
      .map((segment) => [segment.id, segment] as const),
  );
  if (
    !latest.segments.some(
      (segment) =>
        JSON.stringify(previousSegments.get(segment.id)) !==
        JSON.stringify(segment),
    )
  )
    return { error: '正文分页没有新增或更新分段，已停止继续加载' };
  return result;
}
