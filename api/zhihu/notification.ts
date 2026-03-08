import apiClient from '../client';

export const getNotifications = async (nextUrl?: string, entryName: string = 'all') => {
    const url = nextUrl || `/notifications/v2/recent?limit=10&entry_name=${entryName}`;
    const res = await apiClient.get(url);
    return res.data;
};

export const markAllNotificationsRead = async () => {
    const res = await apiClient.post('/notifications/v2/timeline/actions/readall', {});
    return res.data;
};
