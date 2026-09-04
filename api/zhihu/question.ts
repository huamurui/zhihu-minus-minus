import type { ZhihuPaging, ZhihuQuestion } from '@/types/zhihu';
import apiClient from '../client';
import type {
  AnswerDetail,
  AnswerQuestion,
  QuestionAnswersResponse,
} from './answer';

export type ZhihuQuestionBrief = AnswerQuestion;
export type ZhihuAnswer = AnswerDetail;
export type ZhihuAnswersPaging = ZhihuPaging;
export type ZhihuAnswersResponse = QuestionAnswersResponse;

export interface ZhihuQuestionDetail extends ZhihuQuestion {
  detail?: string;
  excerpt?: string;
  answer_count?: number;
  comment_count?: number;
  follower_count?: number;
  visit_count?: number;
  link_card_info?: Record<string, string>;
}

export const QUESTION_INCLUDE =
  'detail,excerpt,answer_count,comment_count,follower_count,visit_count,topics,relationship.is_following,relationship.is_author,relationship.is_anonymous,relationship.voting,relationship.is_thanked,relationship.is_nothelp';

export const getQuestion = async (
  id: string | number,
  include?: string,
): Promise<ZhihuQuestionDetail> => {
  const res = await apiClient.get<ZhihuQuestionDetail>(
    `/questions/${id}?include=${include || QUESTION_INCLUDE}`,
  );
  return res.data;
};

export const followQuestion = async (id: string | number) => {
  const res = await apiClient.post(`/questions/${id}/followers`);
  return res.data;
};

export const unfollowQuestion = async (id: string | number) => {
  const res = await apiClient.delete(`/questions/${id}/followers`);
  return res.data;
};

export const createQuestion = async (title: string, content: string) => {
  const timestamp = Date.now();
  const uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
  const traceId = `${timestamp},${uuid}`;

  const payload = {
    action: 'question',
    data: {
      publish: { traceId },
      draft: { isPublished: false, disabled: 1 },
      question: {
        title,
        detail: content,
        topics: [],
        is_anonymous: false,
      },
    },
  };

  const res = await apiClient.post('/content/publish', payload);
  return res.data;
};
