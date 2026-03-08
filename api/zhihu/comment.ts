import apiClient from '../client';

export const getAnswerComments = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,content,child_comment_count,child_comments,vote_count,created_time';
    const res = await apiClient.get(`/answers/${id}/root_comments?limit=${limit}&offset=${offset}&include=${include}`);
    return res.data;
};

export const createAnswerComment = async (id: string | number, content: string) => {
    const res = await apiClient.post(`/answers/${id}/comments`, {
        content,
        type: 'comment'
    });
    return res.data;
};

export const getChildComments = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,vote_count,content,created_time,reply_to_author';
    const res = await apiClient.get(`/comments/${id}/child_comments?limit=${limit}&offset=${offset}&include=${include}`);
    return res.data;
};

export const getCommentReplies = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,content,vote_count,created_time,reply_to_comment';
    const res = await apiClient.get(`/comments/${id}/replies?limit=${limit}&offset=${offset}&include=${include}`);
    return res.data;
};

export const createCommentReply = async (id: string | number, content: string, extra?: Record<string, any>) => {
    const res = await apiClient.post(`/comments/${id}/replies`, {
        content,
        type: 'comment',
        ...extra
    });
    return res.data;
};

export const voteComment = async (id: string | number, type: 'up' | 'neutral') => {
    const res = await apiClient.post(`/comments/${id}/voters`, { type });
    return res.data;
};
