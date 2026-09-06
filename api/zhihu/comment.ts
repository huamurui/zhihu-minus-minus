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
  [key: string]: unknown;
}

export interface CreateCommentPayload {
  content: string;
  type: 'comment';
  reply_to_comment_id?: string | number;
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
    payload.reply_to_comment_id = replyToCommentId;
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
  const res = await apiClient.post<CreateCommentResponse>(
    `/pins/${id}/comments`,
    {
      content,
      type: 'comment',
    },
  );
  return res.data;
};

export const createArticleComment = async (
  id: string | number,
  content: string,
): Promise<CreateCommentResponse> => {
  const res = await apiClient.post<CreateCommentResponse>(
    `/articles/${id}/comments`,
    {
      content,
      type: 'comment',
    },
  );
  return res.data;
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
  typeof value === 'object' && value !== null;

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
