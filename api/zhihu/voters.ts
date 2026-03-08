import apiClient from '../client';

export const voteContent = async (
    id: string | number,
    type: 'answers' | 'articles' | 'questions' | 'pins' | 'comments',
    voteType: 'up' | 'neutral' | 'down' | 'like'
) => {
    if (type === 'pins') {
        if (voteType === 'like') {
            const res = await apiClient.post(`/pins/${id}/reactions`, { type: 'like' });
            return res.data;
        } else {
            const res = await apiClient.delete(`/pins/${id}/reactions`);
            return res.data;
        }
    } else {
        const res = await apiClient.post(`/${type}/${id}/voters`, { type: voteType });
        return res.data;
    }
};
