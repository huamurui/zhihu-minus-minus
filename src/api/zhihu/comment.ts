import axios from 'axios';
import type { TextSelectionInfo } from '@/features/rich-content';
import { normalizeCommentTags } from '@/utils/commentIdentity';
import { getCommentImageUrl } from '@/utils/zhihuContent';
import apiClient from '../client';
import type { ZhihuVoteResponse } from './voters';

export interface CommentVipIcon {
  url?: string;
  night_mode_url?: string;
}

export interface CommentVipInfo {
  is_vip: boolean;
  target_url?: string | null;
  vip_icon?: CommentVipIcon;
}

export interface CommentBadge {
  type: string;
  description: string;
}

export interface CommentBadgeV2 {
  title: string;
  merged_badges: unknown[] | null;
  detail_badges: unknown[] | null;
}

export interface CommentExposedMedal {
  medal_id: string;
  medal_name: string;
  avatar_url: string;
  description: string;
  medal_avatar_frame: string;
  can_click: boolean;
}

export interface CommentMember {
  id: string;
  url_token: string;
  name: string;
  avatar_url: string;
  avatar_url_template?: string;
  is_org?: boolean;
  is_following?: boolean;
  type?: string;
  url?: string;
  user_type?: string;
  headline?: string;
  badge?: CommentBadge[];
  badge_v2?: CommentBadgeV2;
  exposed_medal?: CommentExposedMedal;
  gender?: number;
  is_advertiser?: boolean;
  vip_info?: CommentVipInfo;
  kvip_info?: CommentVipInfo;
  level_info?: unknown | null;
  is_anonymous?: boolean;
  ring_info?: unknown | null;
}

export interface CommentAuthor {
  role?: string;
  member: CommentMember;
}

export interface CommentTag {
  type: string;
  text: string;
  color?: string;
  night_color?: string;
  has_border?: boolean;
  border_color?: string;
  border_night_color?: string;
}

export interface CommentItem {
  id: number | string;
  type: 'comment';
  resource_type?: string;
  member_id?: number | string;
  url?: string;
  content: string;
  score?: number;
  comment_type?: number;
  created_time: number;
  is_delete?: boolean;
  reviewing?: boolean;
  reply_comment_id?: number | string | null;
  reply_root_comment_id?: number | string | null;
  liked?: boolean;
  like_count?: number;
  disliked?: boolean;
  dislike_count?: number;
  is_author?: boolean;
  can_like?: boolean;
  can_dislike?: boolean;
  can_delete?: boolean;
  can_reply?: boolean;
  can_hot?: boolean;
  can_author_top?: boolean;
  is_author_top?: boolean;
  can_share?: boolean;
  can_unfold?: boolean;
  can_truncate?: boolean;
  can_more?: boolean;
  comment_tag?: CommentTag[];
  author_tag?: CommentTag[];
  reply_author_tag?: CommentTag[];
  content_tag?: CommentTag[];
  featured?: boolean;
  top?: boolean;
  collapsed?: boolean;
  allow_like?: boolean;
  allow_delete?: boolean;
  allow_reply?: boolean;
  allow_vote?: boolean;
  can_recommend?: boolean;
  can_collapse?: boolean;
  attached_info?: string;
  author: CommentAuthor;
  vote_count?: number;
  reply_to_author?: CommentAuthor | null;
  voting?: boolean;
  censor_status?: number;
  address_text?: string;
  child_comment_count: number;
  child_comment_next_offset?: string | number | null;
  child_comments: CommentItem[];
  relationship?: {
    voting: number;
  };
  is_visible_only_to_myself?: boolean;
  _?: unknown;
  level_tag?: number;
  is_gift?: boolean;
  disclaimer_info?: unknown | null;
}

export interface CommentStatus {
  type?: number;
  text?: string;
  induce_text?: string;
  can_comment?: boolean;
  can_reply?: boolean;
  toast?: string;
}

export interface CommentAtmosphereVotingDetail {
  emoji_level: string;
  title: string;
  normal_icon: string;
  selected_icon: string;
}

export interface CommentAtmosphereVotingConfig {
  daily_frequency: number;
  frequency_interval: number;
  min_num_of_root_comment: number;
  location: number;
  title: string;
  detail: CommentAtmosphereVotingDetail[];
}

export interface CommentCounts {
  total_counts: number;
  collapsed_counts: number;
  reviewing_counts: number;
  segment_comment_counts: number;
}

export interface CommentPermission {
  permission: string;
  text: string;
  checked: boolean;
  disable: boolean;
  disable_alert: string;
  icon: string;
}

export interface CommentEditStatus {
  can_reply: boolean;
  toast: string;
}

export interface CommentSorter {
  type: string;
  text: string;
}

export interface CommentPaging {
  is_end: boolean;
  is_start: boolean;
  next: string;
  previous: string;
  totals: number;
}

export interface ZhihuCommentResponse {
  ad_plugin_infos?: unknown[];
  atmosphere_voting_config?: CommentAtmosphereVotingConfig;
  featured_counts?: number;
  common_counts?: number;
  collapsed_counts?: number;
  reviewing_counts?: number;
  counts?: CommentCounts;
  comment_status?: CommentStatus;
  current_permission?: CommentPermission;
  edit_status?: CommentEditStatus;
  header?: unknown[];
  is_content_author?: boolean;
  is_content_rewardable?: boolean;
  paging: CommentPaging;
  data: CommentItem[];
  sorter?: CommentSorter[];
}

export interface DeleteCommentResponse {
  success: boolean;
}

export type CommentResourceType = 'answers' | 'questions' | 'articles' | 'pins';

export interface CreateCommentResponse {
  id?: string | number;
  type?: string;
  content?: string;
  reply_comment_id?: string | number | null;
  reply_root_comment_id?: string | number | null;
  [key: string]: unknown;
}

export interface CreateCommentPayload {
  content: string;
  type: 'comment';
  reply_comment_id?: string | number;
}

export interface AnswerSegmentCommentTarget {
  readonly answerId: string;
  readonly segmentIds: readonly string[];
}

export interface AnswerSegmentCommentContext
  extends AnswerSegmentCommentTarget {
  readonly segmentText: string;
  readonly paragraphId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

function segmentRouteRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Legacy links can read an answer thread without source-position metadata. */
export function parseAnswerSegmentCommentTarget(
  value: unknown,
): AnswerSegmentCommentTarget | null {
  const route = segmentRouteRecord(value);
  if (
    !route ||
    (route.type !== undefined &&
      route.type !== 'answer' &&
      route.type !== 'answers') ||
    typeof route.id !== 'string' ||
    !/^[1-9]\d*$/.test(route.id) ||
    typeof route.segmentId !== 'string'
  )
    return null;
  const ids = route.segmentId.split(',').map((id) => id.trim());
  return ids.length && ids.every((id) => /^[1-9]\d*$/.test(id))
    ? { answerId: route.id, segmentIds: [...new Set(ids)] }
    : null;
}

function isTextOffset(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function segmentTextOffset(value: unknown): number | null {
  const offset =
    typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value)
      ? Number(value)
      : value;
  return isTextOffset(offset) ? offset : null;
}

function isParagraphId(value: unknown): value is string {
  return typeof value === 'string' && !!value && value.trim() === value;
}

export function isValidAnswerCommentSelection(
  answerId: string,
  selection: unknown,
): selection is TextSelectionInfo {
  const source = segmentRouteRecord(selection);
  if (
    typeof answerId !== 'string' ||
    !/^[1-9]\d*$/.test(answerId) ||
    !source ||
    typeof source.text !== 'string' ||
    !source.text.trim() ||
    /[\uD800-\uDFFF\uFFFC]/u.test(source.text) ||
    !isParagraphId(source.startParagraphId) ||
    !isParagraphId(source.endParagraphId) ||
    !isTextOffset(source.startOffset) ||
    !isTextOffset(source.endOffset)
  )
    return false;
  // Both renderers join source paragraphs with a newline. Everything after
  // that boundary starts at offset zero in the final paragraph.
  return source.startParagraphId === source.endParagraphId
    ? source.endOffset - source.startOffset === source.text.length
    : source.text[source.text.length - source.endOffset - 1] === '\n';
}

/** A posting context must carry the exact single-paragraph UTF-16 source slice. */
export function parseAnswerSegmentCommentContext(
  value: unknown,
): AnswerSegmentCommentContext | null {
  const route = segmentRouteRecord(value);
  const target = parseAnswerSegmentCommentTarget(value);
  if (
    !route ||
    !target ||
    (route.type !== 'answer' && route.type !== 'answers')
  )
    return null;
  const selection = {
    text: route.text,
    startParagraphId: route.pid,
    endParagraphId: route.pid,
    startOffset: segmentTextOffset(route.startOffset),
    endOffset: segmentTextOffset(route.endOffset),
  };
  if (!isValidAnswerCommentSelection(target.answerId, selection)) return null;
  return {
    ...target,
    segmentText: selection.text,
    paragraphId: selection.startParagraphId,
    startOffset: selection.startOffset,
    endOffset: selection.endOffset,
  };
}

/** Segment-thread replies use the same endpoint and source context as roots. */
export async function createAnswerSegmentComment(
  context: AnswerSegmentCommentContext,
  content: string,
  replyToCommentId?: string | number,
): Promise<CreateCommentResponse> {
  const verified = parseAnswerSegmentCommentContext({
    id: context.answerId,
    type: 'answer',
    segmentId: context.segmentIds.join(','),
    text: context.segmentText,
    pid: context.paragraphId,
    startOffset: context.startOffset,
    endOffset: context.endOffset,
  });
  if (!verified)
    throw new Error('知识点缺少有效的原文位置，请返回正文重新选择');
  if (
    replyToCommentId !== undefined &&
    !/^[1-9]\d*$/.test(String(replyToCommentId))
  )
    throw new Error('回复目标无效');
  return postAnswerSelectionComment(
    verified.answerId,
    {
      text: verified.segmentText,
      startParagraphId: verified.paragraphId,
      endParagraphId: verified.paragraphId,
      startOffset: verified.startOffset,
      endOffset: verified.endOffset,
    },
    content,
    replyToCommentId,
  );
}

export async function createAnswerSelectionComment(
  answerId: string,
  selection: TextSelectionInfo,
  content: string,
): Promise<CreateCommentResponse> {
  if (!isValidAnswerCommentSelection(answerId, selection))
    throw new Error('选区缺少有效的原文位置，请返回正文重新选择');
  if (!content.trim()) throw new Error('请输入评论内容');
  return postAnswerSelectionComment(answerId, selection, content);
}

async function postAnswerSelectionComment(
  answerId: string,
  selection: TextSelectionInfo,
  content: string,
  replyToCommentId?: string | number,
): Promise<CreateCommentResponse> {
  const payload = {
    content,
    ...(replyToCommentId !== undefined && {
      reply_comment_id: replyToCommentId,
    }),
    segment: {
      content: selection.text,
      position: {
        start: {
          paragraph_id: selection.startParagraphId,
          offset: selection.startOffset,
        },
        end: {
          paragraph_id: selection.endParagraphId,
          offset: selection.endOffset,
        },
      },
    },
  };
  const response = await apiClient.post<CreateCommentResponse>(
    `/comment_v5/answers/${encodeURIComponent(answerId)}/segment/comment`,
    payload,
  );
  return response.data;
}

export const getComment = async (id: string | number): Promise<CommentItem> => {
  const res = await apiClient.get<CommentItem>(`/comments/${id}`);
  return normalizeComment(res.data);
};

export const getAnswerComments = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuCommentResponse> => {
  const include =
    'data[*].author,content,child_comment_count,child_comments,vote_count,created_time';
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/answers/${id}/root_comments?limit=${limit}&offset=${offset}&include=${include}`,
  );
  if (res.data?.data) {
    res.data.data = res.data.data.map(normalizeComment);
  }
  return res.data;
};

export const createAnswerComment = async (
  id: string | number,
  content: string,
): Promise<CreateCommentResponse> => {
  const res = await apiClient.post<CreateCommentResponse>(
    `/answers/${id}/comments`,
    {
      content,
      type: 'comment',
    },
  );
  return res.data;
};

export const getChildComments = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuCommentResponse> => {
  const include =
    'data[*].author,vote_count,content,created_time,reply_to_author';
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comments/${id}/child_comments?limit=${limit}&offset=${offset}&include=${include}`,
  );
  if (res.data?.data) {
    res.data.data = res.data.data.map(normalizeComment);
  }
  return res.data;
};

export const getCommentReplies = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuCommentResponse> => {
  const include =
    'data[*].author,content,vote_count,created_time,reply_to_comment';
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comments/${id}/replies?limit=${limit}&offset=${offset}&include=${include}`,
  );
  if (res.data?.data) {
    res.data.data = res.data.data.map(normalizeComment);
  }
  return res.data;
};

export const createCommentReply = async (
  id: string | number,
  content: string,
  extra?: Record<string, unknown>,
): Promise<CreateCommentResponse> => {
  const res = await apiClient.post<CreateCommentResponse>(
    `/comments/${id}/replies`,
    {
      content,
      type: 'comment',
      ...extra,
    },
  );
  return res.data;
};

export const voteComment = async (
  id: string | number,
  type: 'up' | 'neutral',
): Promise<ZhihuVoteResponse> => {
  if (type === 'up') {
    const res = await apiClient.post<ZhihuVoteResponse>(
      `/comments/${encodeURIComponent(String(id))}/like`,
    );
    return res.data;
  } else {
    const res = await apiClient.delete<ZhihuVoteResponse>(
      `/comments/${encodeURIComponent(String(id))}/like`,
    );
    return res.data;
  }
};

export const getQuestionComments = async (
  id: string | number,
  limit = 20,
  offset = 0,
): Promise<ZhihuCommentResponse> => {
  const include =
    'data[*].author,content,child_comment_count,child_comments,vote_count,created_time';
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/questions/${id}/root_comments?limit=${limit}&offset=${offset}&include=${include}`,
  );
  if (res.data?.data) {
    res.data.data = res.data.data.map(normalizeComment);
  }
  return res.data;
};

export const createQuestionComment = async (
  id: string | number,
  content: string,
): Promise<CreateCommentResponse> => {
  const res = await apiClient.post<CreateCommentResponse>(
    `/questions/${id}/comments`,
    {
      content,
      type: 'comment',
    },
  );
  return res.data;
};

/**
 * Zhihu Comment V5 APIs
 */

export const createCommentV5 = async (
  resourceType: CommentResourceType,
  resourceId: string | number,
  content: string,
  replyToCommentId?: string | number,
): Promise<CreateCommentResponse> => {
  const payload: CreateCommentPayload = {
    content,
    type: 'comment',
  };
  if (replyToCommentId !== undefined) {
    payload.reply_comment_id = replyToCommentId;
  }

  const res = await apiClient.post<CreateCommentResponse>(
    `/comment_v5/${resourceType}/${encodeURIComponent(String(resourceId))}/comment`,
    payload,
  );
  return res.data;
};

export const getAnswerCommentsV5 = async (
  id: string | number,
  limit = 20,
  offset: string | number = '',
  orderBy: 'score' | 'ts' = 'score',
): Promise<ZhihuCommentResponse> => {
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comment_v5/answers/${id}/root_comment?order_by=${orderBy}&limit=${limit}&offset=${offset}`,
  );
  res.data.data = (res.data.data || []).map(normalizeComment);
  return res.data;
};

export const getQuestionCommentsV5 = async (
  id: string | number,
  limit = 20,
  offset: string | number = '',
  orderBy: 'score' | 'ts' = 'score',
): Promise<ZhihuCommentResponse> => {
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comment_v5/questions/${id}/root_comment?order_by=${orderBy}&limit=${limit}&offset=${offset}`,
  );
  res.data.data = (res.data.data || []).map(normalizeComment);
  return res.data;
};

export const getArticleCommentsV5 = async (
  id: string | number,
  limit = 20,
  offset: string | number = '',
  orderBy: 'score' | 'ts' = 'score',
): Promise<ZhihuCommentResponse> => {
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comment_v5/articles/${id}/root_comment?order_by=${orderBy}&limit=${limit}&offset=${offset}`,
  );
  res.data.data = (res.data.data || []).map(normalizeComment);
  return res.data;
};

export const getPinCommentsV5 = async (
  id: string | number,
  limit = 20,
  offset: string | number = '',
  orderBy: 'score' | 'ts' = 'score',
): Promise<ZhihuCommentResponse> => {
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comment_v5/pins/${id}/root_comment?order_by=${orderBy}&limit=${limit}&offset=${offset}`,
  );
  res.data.data = (res.data.data || []).map(normalizeComment);
  return res.data;
};

export const createPinComment = async (
  id: string | number,
  content: string,
): Promise<CreateCommentResponse> => {
  return createCommentV5('pins', id, content);
};

export const createArticleComment = async (
  id: string | number,
  content: string,
): Promise<CreateCommentResponse> => {
  return createCommentV5('articles', id, content);
};

export const getChildCommentsV5 = async (
  id: string | number,
  limit = 20,
  offset: string | number = '',
): Promise<ZhihuCommentResponse> => {
  const res = await apiClient.get<ZhihuCommentResponse>(
    `/comment_v5/comment/${id}/child_comment?order_by=ts&limit=${limit}&offset=${offset}`,
  );
  res.data.data = (res.data.data || []).map(normalizeComment);
  return res.data;
};

export const deleteComment = async (
  id: string | number,
): Promise<DeleteCommentResponse> => {
  const res = await apiClient.delete<DeleteCommentResponse>(
    `/comment_v5/comment/${encodeURIComponent(String(id))}`,
  );
  return res.data;
};

/**
 * 格式化评论数据，兼容 v4 和 v5 结构
 */
type CommentRecord = Record<string, unknown>;

const isCommentRecord = (value: unknown): value is CommentRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export type CommentStickers = Readonly<Record<string, string>>;

/** This public catalogue includes small inline PNGs as well as CDN URLs. */
export async function getCommentStickers(
  signal?: AbortSignal,
): Promise<CommentStickers> {
  const response = await axios.get<unknown>(
    'https://www.zhihu.com/api/v4/sticker-groups/1114161698310770688',
    { signal, timeout: 10000, withCredentials: false },
  );
  const body = response.data;
  const group = isCommentRecord(body) ? body.data : null;
  if (!isCommentRecord(group) || !Array.isArray(group.stickers)) {
    throw new Error('评论表情目录暂不可用');
  }
  const result: Record<string, string> = {};
  for (const entry of group.stickers) {
    if (!isCommentRecord(entry)) continue;
    const { placeholder, static_image_url: source } = entry;
    if (
      typeof placeholder !== 'string' ||
      !/^\[[^\s[\]<>]{1,32}\]$/.test(placeholder) ||
      typeof source !== 'string'
    )
      continue;
    // Only the fixed first-party catalogue may supply PNG data. User-authored HTML cannot.
    const url = source.startsWith('data:')
      ? source.length <= 256 * 1024 &&
        /^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(source)
        ? source
        : null
      : getCommentImageUrl(source);
    if (url) result[placeholder] = url;
  }
  return result;
}

const normalizeAuthor = (value: unknown): CommentAuthor | undefined => {
  if (!isCommentRecord(value)) return undefined;

  if (isCommentRecord(value.member)) {
    return {
      role: typeof value.role === 'string' ? value.role : undefined,
      member: value.member as unknown as CommentMember,
    };
  }

  return { member: value as unknown as CommentMember };
};

const normalizeComment = (comment: unknown): CommentItem => {
  if (!isCommentRecord(comment)) return comment as CommentItem;

  const normalized = { ...comment } as unknown as CommentItem;
  normalized.is_author = comment.is_author === true;
  normalized.author_tag = normalizeCommentTags(comment.author_tag);
  normalized.reply_author_tag = normalizeCommentTags(comment.reply_author_tag);
  normalized.comment_tag = normalizeCommentTags(comment.comment_tag);

  // 1. 处理作者结构 (V5 扁平化了)
  const author = normalizeAuthor(comment.author);
  if (author) {
    normalized.author = author;
  }

  // 2. 处理回复对象的作者结构
  if (comment.reply_to_author) {
    normalized.reply_to_author =
      normalizeAuthor(comment.reply_to_author) ?? null;
  }

  // 3. 处理点赞数 (V5 是 like_count)
  if (
    normalized.vote_count === undefined &&
    typeof comment.like_count === 'number'
  ) {
    normalized.vote_count = comment.like_count;
  }

  // 4. 处理点赞状态 (V5 是 liked)
  if (!normalized.relationship && typeof comment.liked === 'boolean') {
    normalized.relationship = {
      voting: comment.liked ? 1 : 0,
    };
  }

  // 5. 递归处理子评论 (V5 有时候会自带部分子评论)
  if (Array.isArray(comment.child_comments)) {
    normalized.child_comments = comment.child_comments.map(normalizeComment);
  }

  // 6. 处理 IP 属地 (V5 使用 comment_tag 结构)
  if (!normalized.address_text && Array.isArray(comment.comment_tag)) {
    const ipTag = comment.comment_tag.find(
      (tag): tag is CommentRecord =>
        isCommentRecord(tag) && tag.type === 'ip_info',
    );
    if (ipTag && typeof ipTag.text === 'string') {
      normalized.address_text = ipTag.text;
    }
  }

  return normalized;
};
