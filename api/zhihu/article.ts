import apiClient from '../client';

export const getArticle = async (id: string | number) => {
  const res = await apiClient.get(`/articles/${id}`);
  return res.data;
};
