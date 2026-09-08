import type { ZhihuPaging, ZhihuQuestion } from '@/types/zhihu';
import apiClient from '../client';
import type {
  AnswerDetail,
  AnswerQuestion,
  QuestionAnswersResponse,
} from './answer';
import {
  createPublishingTraceId,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';

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
  'detail,excerpt,answer_count,comment_count,follower_count,visit_count,topics,relationship.is_following,relationship.is_author,relationship.is_anonymous,relationship.voting,relationship.is_thanked,relationship.is_nothelp,relationship.my_answer';

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

export const createQuestion = async (
  title: string,
  html: string,
): Promise<PublishedContentResult> => {
  const payload = {
    action: 'question',
    data: {
      publish: { traceId: createPublishingTraceId() },
      draft: { isPublished: false, disabled: 1 },
      question: {
        title,
        detail: html,
        topics: [],
        is_anonymous: false,
      },
    },
  };

  const res = await apiClient.post('/content/publish', payload);
  return parsePublishedContentResult(res.data);
};
