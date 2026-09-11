import apiClient, { type ApiRequestOptions } from '../client';

export const TOPIC_INCLUDE =
  'introduction,questions_count,best_answers_count,followers_count,is_following,header_card';

export const getTopic = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}?include=${TOPIC_INCLUDE}`);
  return res.data;
};

export const getTopicFeed = async (
  id: string | number,
  type: string = 'hot',
  offset: number = 0,
  options: ApiRequestOptions = {},
) => {
  const typeMapping: Record<string, string> = {
    hot: 'hot',
    'top-answers': 'essence',
    unanswered: 'top_question',
  };
  const feedType = typeMapping[type] || type;
  const include =
    'data[*].target.content,voteup_count,comment_count,author.name,author.avatar_url,author.headline,author.is_following,relationship.voting,relationship.is_author,created_time,segment_infos';
  const res = await apiClient.get(
    `/topics/${id}/feeds/${feedType}?include=${include}&limit=20&offset=${offset}`,
    { signal: options.signal },
  );
  return res.data;
};

export const followTopic = async (id: string | number) => {
  const res = await apiClient.post(`/topics/${id}/followers`);
  return res.data;
};

export const unfollowTopic = async (id: string | number) => {
  const res = await apiClient.delete(`/topics/${id}/followers`);
  return res.data;
};

export const getTopicParents = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}/parent`);
  return res.data;
};

export const getTopicChildren = async (id: string | number) => {
  const res = await apiClient.get(`/topics/${id}/children`);
  return res.data;
};

export const getBestAnswerers = async (
  id: string | number,
  limit: number = 3,
) => {
  const res = await apiClient.get(
    `/topics/${id}/best_answerers?limit=${limit}`,
  );
  return res.data;
};
