import apiClient from '../client';

export const FEED_URLS = {
  following: 'https://www.zhihu.com/api/v3/moments?limit=10',
  recommend: 'https://www.zhihu.com/api/v3/feed/topstory/recommend?limit=10',
  hot: 'https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50',
};

export const getFeed = async (url: string) => {
  const res = await apiClient.get(url);
  return res.data;
};
