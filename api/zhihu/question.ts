import apiClient from '../client';

export const QUESTION_INCLUDE = 'content,excerpt,answer_count,comment_count,follower_count,visit_count,topics,relationship';

export const getQuestion = async (id: string | number, include?: string) => {
    const res = await apiClient.get(`/questions/${id}?include=${include || QUESTION_INCLUDE}`);
    return res.data;
};

export const followQuestion = async (id: string | number) => {
    const res = await apiClient.post(`/questions/${id}/followers`);
    return res.data;
};

export const unfollowQuestion = async (id: string | number) => {
    const res = await apiClient.delete(`/questions/${id}/followers`);
    return res.data;
};
