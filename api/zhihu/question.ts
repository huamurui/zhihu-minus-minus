import { useAuthStore } from '@/store/useAuthStore';
import type { ZhihuPaging, ZhihuQuestion } from '@/types/zhihu';
import apiClient, { hasAuthenticationCookie } from '../client';
import type {
  AnswerDetail,
  AnswerQuestion,
  QuestionAnswersResponse,
} from './answer';
import {
  buildZhihuAppQuestionFeedsUrl,
  buildZhihuAppQuestionUrl,
  buildZhihuAppRelatedObjectsUrl,
  getZhihuAppEndpointHeaders,
} from './appApi';
import {
  createPublishingTraceId,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';
import {
  normalizeZhihuAppQuestionFeeds,
  type ZhihuAppQuestionFeedsResponse,
} from './questionFeed';

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

export interface ZhihuAppRelatedObject {
  id?: string | number;
  type?: string;
  target?: Record<string, unknown>;
}

export interface ZhihuAppRelatedObjectsResponse {
  data: ZhihuAppRelatedObject[];
  paging?: ZhihuPaging;
}

export const QUESTION_INCLUDE =
  'detail,excerpt,answer_count,comment_count,follower_count,visit_count,topics,relationship.is_following,relationship.is_author,relationship.is_anonymous,relationship.voting,relationship.is_thanked,relationship.is_nothelp,relationship.my_answer';

export const getQuestion = async (
  id: string | number,
  include?: string,
): Promise<ZhihuQuestionDetail> => {
  if (hasAuthenticationCookie(useAuthStore.getState().cookies)) {
    const res = await apiClient.get<ZhihuQuestionDetail>(`/questions/${id}`, {
      params: { include: include || QUESTION_INCLUDE },
    });
    return res.data;
  }

  const url = buildZhihuAppQuestionUrl(id, include);
  const res = await apiClient.get<ZhihuQuestionDetail>(url, {
    headers: getZhihuAppEndpointHeaders(url),
  });
  return res.data;
};

export const getQuestionAnswers = async (
  id: string | number,
  pageParam: number | string,
  sortBy: 'default' | 'created',
  include: string,
): Promise<QuestionAnswersResponse> => {
  const isAuthenticated = hasAuthenticationCookie(
    useAuthStore.getState().cookies,
  );
  const offset =
    typeof pageParam === 'number'
      ? pageParam
      : Number(
          new URL(pageParam, 'https://api.zhihu.com').searchParams.get(
            'offset',
          ) || 0,
        );

  if (isAuthenticated) {
    const res = await apiClient.get<QuestionAnswersResponse>(
      `/questions/${id}/answers`,
      {
        params: { include, limit: 20, offset, sort_by: sortBy },
      },
    );
    return res.data;
  }

  const url =
    typeof pageParam === 'string'
      ? pageParam
      : buildZhihuAppQuestionFeedsUrl(id, {
          order: sortBy === 'created' ? 'updated' : 'default',
          limit: 10,
          offset,
        });
  const res = await apiClient.get<ZhihuAppQuestionFeedsResponse>(url, {
    headers: getZhihuAppEndpointHeaders(url),
  });
  return normalizeZhihuAppQuestionFeeds(res.data);
};

export const getRelatedQuestionObjects = async (
  id: string | number,
  isSearch = false,
): Promise<ZhihuAppRelatedObjectsResponse> => {
  const url = buildZhihuAppRelatedObjectsUrl(id, { is_search: isSearch });
  const res = await apiClient.get<ZhihuAppRelatedObjectsResponse>(url, {
    headers: getZhihuAppEndpointHeaders(url),
  });
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
