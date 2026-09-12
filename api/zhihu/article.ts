import type { ZhihuArticle } from '@/types/zhihu';
import apiClient from '../client';
import {
  createPublishingTraceId,
  type PublishedContentResult,
  parsePublishedContentResult,
} from './publishing';

const ZHUANLAN_API_URL = 'https://zhuanlan.zhihu.com/api';

export interface ArticleDraft {
  id: string | number;
  title?: string;
  content?: string;
}

export interface ArticlePublishOptions {
  tableOfContentsEnabled?: boolean;
  topics?: string[];
}

interface ArticleDraftPatch {
  can_reward?: boolean;
  content?: string;
  delta_time?: number;
  table_of_contents?: boolean;
  title?: string;
  titleImage?: string;
  isTitleImageFullScreen?: boolean;
}

export const getArticle = async (
  id: string | number,
): Promise<ZhihuArticle> => {
  const res = await apiClient.get(`/articles/${id}`, {
    params: { include: 'author.is_following' },
  });
  return res.data;
};

export async function createArticleDraft(title: string): Promise<ArticleDraft> {
  const response = await apiClient.post<ArticleDraft>(
    `${ZHUANLAN_API_URL}/articles/drafts`,
    { title, delta_time: 0, can_reward: false },
    {
      headers: {
        Origin: 'https://zhuanlan.zhihu.com',
        Referer: 'https://zhuanlan.zhihu.com/write',
      },
    },
  );
  if (response.data.id === undefined || response.data.id === null) {
    throw new Error('知乎没有返回文章草稿 ID');
  }
  return response.data;
}

export async function updateArticleDraft(
  articleId: string | number,
  patch: ArticleDraftPatch,
): Promise<void> {
  await apiClient.patch(
    `${ZHUANLAN_API_URL}/articles/${encodeURIComponent(String(articleId))}/draft`,
    patch,
    {
      headers: {
        Origin: 'https://zhuanlan.zhihu.com',
        Referer: `https://zhuanlan.zhihu.com/p/${articleId}/edit`,
      },
    },
  );
}

export async function searchArticleTopics(
  articleId: string | number,
  query: string,
): Promise<unknown> {
  const response = await apiClient.get<unknown>(
    `${ZHUANLAN_API_URL}/autocomplete/topics`,
    {
      params: {
        token: query,
        max_matches: 5,
        use_similar: 0,
        topic_filter: 1,
      },
      headers: {
        Referer: `https://zhuanlan.zhihu.com/p/${articleId}/edit`,
      },
    },
  );
  return response.data;
}

function getFirstTopicSuggestion(response: unknown): unknown {
  if (Array.isArray(response)) return response[0];
  if (response && typeof response === 'object' && 'data' in response) {
    const data = (response as { data?: unknown }).data;
    if (Array.isArray(data)) return data[0];
  }
  return undefined;
}

export async function addArticleTopic(
  articleId: string | number,
  topic: unknown,
): Promise<void> {
  await apiClient.post(
    `${ZHUANLAN_API_URL}/articles/${encodeURIComponent(String(articleId))}/topics`,
    topic,
    {
      headers: {
        Origin: 'https://zhuanlan.zhihu.com',
        Referer: `https://zhuanlan.zhihu.com/p/${articleId}/edit`,
      },
    },
  );
}

export async function publishArticleDraft(
  articleId: string | number,
  options: ArticlePublishOptions = {},
  isPublished = false,
): Promise<PublishedContentResult> {
  const tableOfContentsEnabled = options.tableOfContentsEnabled ?? false;
  const traceId = createPublishingTraceId();
  const businessParams = JSON.stringify({
    column: null,
    commentPermission: 'anyone',
    disclaimer_type: 'none',
    disclaimer_status: 'close',
    table_of_contents_enabled: tableOfContentsEnabled,
    commercial_report_info: { commercial_types: [] },
    commercial_zhitask_bind_info: null,
    canReward: false,
  });
  const payload = {
    action: 'article',
    data: {
      publish: { traceId },
      extra_info: {
        publisher: 'pc',
        pc_business_params: businessParams,
      },
      draft: { id: String(articleId), isPublished, disabled: 1 },
      commentsPermission: { comment_permission: 'anyone' },
      creationStatement: {
        disclaimer_type: 'none',
        disclaimer_status: 'close',
      },
      contentsTables: {
        table_of_contents_enabled: tableOfContentsEnabled,
      },
      commercialReportInfo: { isReport: 0 },
      appreciate: { can_reward: false, tagline: '' },
      hybridInfo: {},
    },
  };
  const res = await apiClient.post('/content/publish', payload);
  return parsePublishedContentResult(res.data);
}

export const createArticle = async (
  title: string,
  html: string,
  options: ArticlePublishOptions = {},
): Promise<PublishedContentResult> => {
  const draft = await createArticleDraft(title);
  await updateArticleDraft(draft.id, {
    title,
    content: html,
    table_of_contents: options.tableOfContentsEnabled ?? false,
    delta_time: 0,
    can_reward: false,
  });

  const topicNames = [...new Set(options.topics ?? [])];
  for (const topicName of topicNames) {
    const response = await searchArticleTopics(draft.id, topicName);
    const topic = getFirstTopicSuggestion(response);
    if (!topic) throw new Error(`没有找到话题“${topicName}”`);
    await addArticleTopic(draft.id, topic);
  }

  return publishArticleDraft(draft.id, options);
};

export const updateArticle = async (
  articleId: string | number,
  title: string,
  html: string,
  options: ArticlePublishOptions = {},
): Promise<PublishedContentResult> => {
  await updateArticleDraft(articleId, {
    title,
    content: html,
    table_of_contents: options.tableOfContentsEnabled ?? false,
    delta_time: 0,
    can_reward: false,
  });

  const topicNames = [...new Set(options.topics ?? [])];
  for (const topicName of topicNames) {
    const response = await searchArticleTopics(articleId, topicName);
    const topic = getFirstTopicSuggestion(response);
    if (!topic) throw new Error(`没有找到话题“${topicName}”`);
    await addArticleTopic(articleId, topic);
  }

  return publishArticleDraft(articleId, options, true);
};
