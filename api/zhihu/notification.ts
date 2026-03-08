import apiClient from '../client';

export const getNotifications = async (nextUrl?: string) => {
    const url = nextUrl || '/notifications/v3/timeline?limit=20';
    const res = await apiClient.get(url);
    return res.data;
};
