import apiClient from '../client';

export const voteContent = async (
    id: string | number,
    type: 'answers' | 'articles' | 'questions' | 'pins' | 'comments',
    voteType: 'up' | 'neutral' | 'down' | 'like' | 'unlike'
) => {
    if (type === 'pins') {
        if (voteType === 'like' || voteType === 'up') {
            const res = await apiClient.post(`/pins/${id}/reactions`, { type: 'like' });
            return res.data;
        } else {
            const res = await apiClient.delete(`/pins/${id}/reactions`);
            return res.data;
        }
    } else if (type === 'comments') {
        if (voteType === 'up' || voteType === 'like') {
            const res = await apiClient.post(`/comments/${id}/like`);
            return res.data;
        } else {
            const res = await apiClient.delete(`/comments/${id}/like`);
            return res.data;
        }
    } else {
        const res = await apiClient.post(`/${type}/${id}/voters`, { type: voteType });
        return res.data;
    }
};
