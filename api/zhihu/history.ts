import apiClient from '../client';

export const getReadHistory = async (limit = 20, offset = 0) => {
  const res = await apiClient.get(
    `/unify-consumption/read_history?limit=${limit}&offset=${offset}`,
  );
  return res.data;
};
