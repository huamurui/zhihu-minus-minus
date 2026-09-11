import apiClient, { type ApiRequestOptions } from '../client';

export const getNotifications = async (
  nextUrl?: string,
  entryName: string = 'all',
  options: ApiRequestOptions = {},
) => {
  const url =
    nextUrl || `/notifications/v2/recent?limit=10&entry_name=${entryName}`;
  const res = await apiClient.get(url, { signal: options.signal });
  return res.data;
};

export const markAllNotificationsRead = async () => {
  const res = await apiClient.post(
    '/notifications/v2/timeline/actions/readall',
    {},
  );
  return res.data;
};
