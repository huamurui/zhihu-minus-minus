import type { ZhihuSearchResponse } from '../../types/zhihu';
import apiClient from '../client';

export const getSearchSuggest = async (query: string) => {
  const res = await apiClient.get(
    `/search/suggest?q=${encodeURIComponent(query)}`,
  );
  return res.data;
};

export const searchContent = async (
  query: string,
  offset = 0,
  limit = 20,
  type = 'general',
  options?: {
    restricted_scene?: string;
    restricted_field?: string;
    restricted_value?: string;
    vertical?: 'answer' | 'article' | 'zvideo';
    sort?: 'created_time' | 'upvoted_count';
    time_interval?:
      | 'a_day'
      | 'a_week'
      | 'a_month'
      | 'three_months'
      | 'half_a_year'
      | 'a_year';
  },
): Promise<ZhihuSearchResponse> => {
  const params = new URLSearchParams({
    t: type,
    q: query,
    correction: '1',
    offset: offset.toString(),
    limit: limit.toString(),
    filter_fields: '',
    lc_idx: '0',
    show_all_topics: '0',
    search_source: 'Normal',
  });
  if (options?.vertical) {
    params.set('vertical', options.vertical);
    params.set('vertical_info', '0,0,0,0,0,0,0,0,0,0,0,0');
    params.set('search_source', 'Filter');
  }
  if (options?.sort) {
    params.set('sort', options.sort);
    params.set('search_source', 'Filter');
  }
  if (options?.time_interval) {
    params.set('time_interval', options.time_interval);
    params.set('search_source', 'Filter');
  }
  if (options?.restricted_scene)
    params.append('restricted_scene', options.restricted_scene);
  if (options?.restricted_field)
    params.append('restricted_field', options.restricted_field);
  if (options?.restricted_value)
    params.append('restricted_value', options.restricted_value);

  const res = await apiClient.get(`/search_v3?${params.toString()}`);
  return res.data;
};

export const searchCreatorQuestions = async (query: string) => {
  const res = await apiClient.get(
    `/creators/search/query?query=${encodeURIComponent(query)}`,
  );
  return res.data;
};

export const getInvitedQuestions = async (offset = 0, limit = 20) => {
  const res = await apiClient.get(
    `/notifications/v3/timeline/entry/invite?invite_with_time_slice=1&limit=${limit}&offset=${offset}&invite_domain_score_ab=1`,
  );
  return res.data;
};
