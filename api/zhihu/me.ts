import apiClient from '../client';

export const getMe = async () => {
    const res = await apiClient.get('/me');
    return res.data;
};

export const getMyLikes = async (type: 'answers' | 'articles', limit = 20, offset = 0) => {
    const endpoint = type === 'answers' ? 'voted_answers' : 'voted_articles';
    const include = 'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting';
    const res = await apiClient.get(`/members/me/${endpoint}?limit=${limit}&offset=${offset}&include=${include}`);
    return res.data;
};
