import type {
  ZhihuAuthor,
  ZhihuPaging,
  ZhihuQuestion,
  ZhihuSegmentInfo,
} from '@/types/zhihu';
import apiClient from '../client';

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

export const createAnswer = async (
  questionId: string | number,
  text: string,
) => {
  // 转化成知乎喜欢的 HTML 格式
  const htmlContent = `<p>${text}</p>`;
  // 模拟 traceId (timestamp + uuid)
  const timestamp = Date.now();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const traceId = `${timestamp},${uuid}`;

  const payload = {
    action: 'answer',
    data: {
      publish: { traceId },
      hybridInfo: {},
      draft: { isPublished: false, disabled: 1 },
      extra_info: {
        question_id: String(questionId),
        publisher: 'pc',
      },
      hybrid: {
        html: htmlContent,
        textLength: text.length,
      },
      reprint: { reshipment_settings: 'allowed' },
      commentsPermission: { comment_permission: 'all' },
      appreciate: { can_reward: false, tagline: '' },
      publishSwitch: { draft_type: 'normal' },
      creationStatement: {
        disclaimer_status: 'close',
        disclaimer_type: 'none',
      },
      commercialReportInfo: { isReport: 0 },
      toFollower: {},
      contentsTables: { table_of_contents_enabled: false },
      thanksInvitation: { thank_inviter_status: 'close', thank_inviter: '' },
    },
  };

  // 使用 /content/publish 接口
  const res = await apiClient.post('/content/publish', payload);
  return res.data;
};

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
