import type {
  ZhihuAuthor,
  ZhihuPaging,
  ZhihuQuestion,
  ZhihuSegmentInfo,
} from '@/types/zhihu';
import apiClient from '../client';
import {
  createPublishingTraceId,
  getPublishingTextLength,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';

export interface AnswerQuestion extends Omit<ZhihuQuestion, 'relationship'> {
  relationship?: ZhihuQuestion['relationship'] | null;
}

export interface AnswerDetail {
  id: string | number;
  type?: 'answer';
  answer_type?: string;
  question?: AnswerQuestion;
  author: ZhihuAuthor;
  content: string;
  excerpt: string;
  created_time: number;
  created_time_name?: string;
  updated_time?: number;
  voteup_count: number;
  comment_count: number;
  favlists_count?: number;
  thanks_count?: number;
  visited_count?: number;
  reaction?: {
    relation?: {
      vote?: 'UP' | 'DOWN' | 'NEUTRAL';
      faved?: boolean;
      liked?: boolean;
    };
  };
  relationship?: {
    upvoted_followees?: ZhihuAuthor[];
    is_author?: boolean;
    is_favorited?: boolean;
    is_thanked?: boolean;
    voting?: number;
  };
  segment_infos?: ZhihuSegmentInfo[];
  can_comment?: {
    status: boolean;
    reason: string;
  };
  allow_segment_interaction?: number;
  content_need_truncated?: boolean;
  extras?: string;
  force_login_when_click_read_more?: boolean;
  is_collapsed?: boolean;
  is_copyable?: boolean;
  is_jump_native?: boolean;
  url?: string;
  thumbnail?: string;
  content_img?: string[];
  biz_ext?: unknown;
  ip_info?: string;
  paid_info?: unknown;
  link_card_info?: Record<string, string>;
}

export interface QuestionAnswersResponse {
  data: AnswerDetail[];
  paging?: ZhihuPaging;
  read_count?: number;
}

export interface AnswerPublishOptions {
  answerId?: string | number;
  deltaTime?: number;
  tableOfContentsEnabled?: boolean;
}

export interface AnswerDraftSettings {
  can_reward: boolean;
  commercial_report_info: {
    is_report: boolean;
  };
  comment_permission: string;
  disclaimer_status: string;
  disclaimer_type: string;
  is_copyable: boolean;
  reshipment_settings: string;
  table_of_contents: {
    enabled: boolean;
  };
  table_of_contents_enabled: boolean;
  thank_inviter: string;
  thank_inviter_status: string;
}

/** Response returned by `POST /questions/{id}/draft`. */
export interface AnswerDraft {
  answer_type: string;
  attachment: Record<string, unknown> | null;
  content: string;
  created_time: number;
  draft_type: string;
  editable_content: string;
  excerpt: string;
  settings: AnswerDraftSettings;
  title: {
    enabled: boolean;
  };
  type: 'draft';
  updated_time: number;
  url: string;
}

interface AnswerDraftRequestSettings {
  can_reward: boolean;
  commercial_report_info: {
    is_report: boolean;
  };
  comment_permission: 'all';
  disclaimer_status: 'close';
  disclaimer_type: 'none';
  reshipment_settings: 'allowed';
  table_of_contents_enabled: boolean;
  tagline: string;
  thank_inviter: string;
  thank_inviter_status: 'close';
}

interface AnswerDraftRequest {
  content: string;
  delta_time: number;
  draft_type: 'normal';
  settings: AnswerDraftRequestSettings;
}

interface AnswerPublishRequest {
  action: 'answer';
  data: {
    appreciate: { can_reward: false; tagline: string };
    commentsPermission: Record<string, never>;
    commercialReportInfo: { isReport: 0 };
    contentsTables: { table_of_contents_enabled: boolean };
    creationStatement: {
      disclaimer_status: 'close';
      disclaimer_type: 'none';
    };
    draft:
      | { disabled: 1; isPublished: false }
      | {
          contentId: string;
          disabled: 1;
          isPublished: true;
        };
    extra_info: {
      include: string;
      pc_business_params: string;
      publisher: 'pc';
      question_id?: string;
    };
    hybrid: { html: string; textLength: number };
    hybridInfo: Record<string, never>;
    publish: { traceId: string };
    publishSwitch: { draft_type: 'normal' };
    reprint: Record<string, never>;
    thanksInvitation: {
      thank_inviter: string;
      thank_inviter_status: 'close';
    };
    toFollower: Record<string, never>;
  };
}

const ANSWER_PUBLISH_INCLUDE =
  'is_contain_ai_content,is_visible,paid_info,paid_info_content,has_column,admin_closed_comment,reward_info,annotation_action,annotation_detail,collapse_reason,is_normal,is_sticky,collapsed_by,suggest_edit,comment_count,thanks_count,favlists_count,can_comment,content,editable_content,voteup_count,reshipment_settings,comment_permission,created_time,updated_time,review_info,relevant_info,question,excerpt,attachment,content_source,is_labeled,endorsements,reaction_instruction,reaction,ip_info,relationship.is_authorized,voting,is_thanked,is_author,is_nothelp,is_favorited;author.vip_info,kvip_info,badge[*].topics;settings.table_of_content.enabled';

export const getAnswer = async (
  id: string | number,
  include?: string,
): Promise<AnswerDetail> => {
  const defaultInclude =
    'content,paid_info,can_comment,excerpt,thanks_count,voteup_count,comment_count,visited_count,reaction,ip_info,question.topics,author.is_following,reaction.relation.voting,segment_infos,favlists_count';
  const res = await apiClient.get(
    `/answers/${id}?include=${include || defaultInclude}`,
  );
  return res.data;
};

export const voteAnswer = async (
  id: string | number,
  type: 'up' | 'neutral' | 'down',
) => {
  const res = await apiClient.post(`/answers/${id}/voters`, { type });
  return res.data;
};

export async function saveAnswerDraft(
  questionId: string | number,
  html: string,
  options: AnswerPublishOptions = {},
): Promise<AnswerDraft> {
  const tableOfContentsEnabled = options.tableOfContentsEnabled ?? false;
  const payload: AnswerDraftRequest = {
    content: html,
    draft_type: 'normal',
    delta_time: options.deltaTime ?? 0,
    settings: {
      reshipment_settings: 'allowed',
      comment_permission: 'all',
      can_reward: false,
      tagline: '',
      disclaimer_status: 'close',
      disclaimer_type: 'none',
      commercial_report_info: { is_report: false },
      table_of_contents_enabled: tableOfContentsEnabled,
      thank_inviter_status: 'close',
      thank_inviter: '',
    },
  };
  const response = await apiClient.post<AnswerDraft>(
    `/questions/${encodeURIComponent(String(questionId))}/draft`,
    payload,
    {
      headers: {
        Origin: 'https://www.zhihu.com',
        Referer: options.answerId
          ? `https://www.zhihu.com/question/${questionId}/answer/${options.answerId}`
          : `https://www.zhihu.com/question/${questionId}/answer`,
      },
    },
  );
  return response.data;
}

export async function publishAnswer(
  questionId: string | number,
  html: string,
  options: AnswerPublishOptions = {},
): Promise<PublishedContentResult> {
  const tableOfContentsEnabled = options.tableOfContentsEnabled ?? false;
  const isPublished = options.answerId !== undefined;
  const questionIdString = String(questionId);
  const businessParams = JSON.stringify({
    is_paid_column: false,
    reward_setting: { can_reward: false, tagline: '' },
    disclaimer_status: 'close',
    disclaimer_type: 'none',
    commercial_report_info: { is_report: false },
    commercial_zhitask_bind_info: null,
    is_report: false,
    push_activity: true,
    table_of_contents_enabled: tableOfContentsEnabled,
    thank_inviter_status: 'close',
    thank_inviter: '',
  });
  const payload: AnswerPublishRequest = {
    action: 'answer',
    data: {
      publish: { traceId: createPublishingTraceId() },
      hybridInfo: {},
      draft: isPublished
        ? {
            contentId: String(options.answerId),
            isPublished: true,
            disabled: 1,
          }
        : { isPublished: false, disabled: 1 },
      extra_info: {
        ...(!isPublished && { question_id: questionIdString }),
        publisher: 'pc',
        include: ANSWER_PUBLISH_INCLUDE,
        pc_business_params: businessParams,
      },
      hybrid: {
        html,
        textLength: getPublishingTextLength(html),
      },
      reprint: {},
      commentsPermission: {},
      appreciate: { can_reward: false, tagline: '' },
      publishSwitch: { draft_type: 'normal' },
      creationStatement: {
        disclaimer_status: 'close',
        disclaimer_type: 'none',
      },
      commercialReportInfo: { isReport: 0 },
      toFollower: {},
      contentsTables: {
        table_of_contents_enabled: tableOfContentsEnabled,
      },
      thanksInvitation: { thank_inviter_status: 'close', thank_inviter: '' },
    },
  };
  const res = await apiClient.post('/content/publish', payload);
  return parsePublishedContentResult(res.data);
}

export const createAnswer = async (
  questionId: string | number,
  html: string,
  options: AnswerPublishOptions = {},
): Promise<PublishedContentResult> => {
  await saveAnswerDraft(questionId, html, options);
  return publishAnswer(questionId, html, options);
};

export const updateAnswer = async (
  questionId: string | number,
  answerId: string | number,
  html: string,
  options: Omit<AnswerPublishOptions, 'answerId'> = {},
): Promise<PublishedContentResult> =>
  createAnswer(questionId, html, { ...options, answerId });

export const deleteAnswer = async (id: string | number) => {
  const res = await apiClient.delete(`/answers/${id}`);
  return res.data;
};

export const reactAnswerSegment = async (
  answerId: string | number,
  segId: string,
  content: string,
  paragraphId: string,
  startOffset: number,
  endOffset: number,
) => {
  const payload = {
    seg_id: segId,
    content: content,
    position: {
      start: { paragraph_id: paragraphId, offset: startOffset },
      end: { paragraph_id: paragraphId, offset: endOffset },
    },
  };
  const res = await apiClient.post(
    `/reaction/answers/${answerId}/segment_reaction`,
    payload,
  );
  return res.data;
};

export const createSegmentReaction = async (
  answerId: string | number,
  content: string,
  startParagraphId: string,
  startOffset: number,
  endParagraphId: string,
  endOffset: number,
) => {
  const payload = {
    content,
    position: {
      start: { paragraph_id: startParagraphId, offset: startOffset },
      end: { paragraph_id: endParagraphId, offset: endOffset },
    },
  };
  const res = await apiClient.post(
    `/reaction/answers/${answerId}/segment_reaction`,
    payload,
  );
  return res.data;
};

export const unreactAnswerSegment = async (
  answerId: string | number,
  segId: string,
) => {
  // 根据抓包，这里 body 是 seg_ids 且为字符串
  const res = await apiClient.delete(
    `/reaction/answers/${answerId}/segment_reaction`,
    {
      data: { seg_ids: segId },
    },
  );
  return res.data;
};

interface SegmentCommentAuthor {
  member?: SegmentCommentAuthor;
  [key: string]: unknown;
}

interface SegmentComment {
  author?: SegmentCommentAuthor;
  relationship?: { voting: number };
  liked?: boolean;
  vote_count?: number;
  like_count?: number;
  [key: string]: unknown;
}

interface SegmentCommentsResponse {
  data?: SegmentComment[];
  [key: string]: unknown;
}

export const getSegmentComments = async (
  answerId: string | number,
  segmentId: string,
  limit = 20,
  offset = '',
): Promise<SegmentCommentsResponse> => {
  const res = await apiClient.get<SegmentCommentsResponse>(
    `/comment_v5/answers/${answerId}/segment/root_comment?segment_id=${segmentId}&order_by=score&limit=${limit}&offset=${offset}`,
  );
  // 基础标准化 (V5 扁平化了作者结构)
  if (res.data?.data) {
    res.data.data = res.data.data.map((comment) => {
      if (comment.author && !comment.author.member) {
        comment.author = { member: { ...comment.author } };
      }
      if (!comment.relationship && comment.liked !== undefined) {
        comment.relationship = { voting: comment.liked ? 1 : 0 };
      }
      if (
        comment.vote_count === undefined &&
        comment.like_count !== undefined
      ) {
        comment.vote_count = comment.like_count;
      }
      return comment;
    });
  }
  return res.data;
};
