import apiClient from '../client';

export const getAnswer = async (id: string | number, include?: string) => {
    const defaultInclude = 'content,voteup_count,comment_count,author.headline,author.follower_count,author.badge,question.title,relationship.voting';
    const res = await apiClient.get(`/answers/${id}?include=${include || defaultInclude}`);
    return res.data;
};

export const voteAnswer = async (id: string | number, type: 'up' | 'neutral' | 'down') => {
    const res = await apiClient.post(`/answers/${id}/voters`, { type });
    return res.data;
};
