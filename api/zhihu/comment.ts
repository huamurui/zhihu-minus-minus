import apiClient from '../client';

export const getAnswerComments = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,content,child_comment_count,child_comments,vote_count,created_time';
    const res = await apiClient.get(`/answers/${id}/root_comments?limit=${limit}&offset=${offset}&include=${include}`);
    if (res.data?.data) {
        res.data.data = res.data.data.map(normalizeComment);
    }
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
    if (res.data?.data) {
        res.data.data = res.data.data.map(normalizeComment);
    }
    return res.data;
};

export const getCommentReplies = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,content,vote_count,created_time,reply_to_comment';
    const res = await apiClient.get(`/comments/${id}/replies?limit=${limit}&offset=${offset}&include=${include}`);
    if (res.data?.data) {
        res.data.data = res.data.data.map(normalizeComment);
    }
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
    if (type === 'up') {
        const res = await apiClient.post(`/comments/${id}/like`);
        return res.data;
    } else {
        const res = await apiClient.delete(`/comments/${id}/like`);
        return res.data;
    }
};
export const getQuestionComments = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].author,content,child_comment_count,child_comments,vote_count,created_time';
    const res = await apiClient.get(`/questions/${id}/root_comments?limit=${limit}&offset=${offset}&include=${include}`);
    if (res.data?.data) {
        res.data.data = res.data.data.map(normalizeComment);
    }
    return res.data;
};

export const createQuestionComment = async (id: string | number, content: string) => {
    const res = await apiClient.post(`/questions/${id}/comments`, {
        content,
        type: 'comment'
    });
    return res.data;
};

/**
 * Zhihu Comment V5 APIs
 */

export const getAnswerCommentsV5 = async (id: string | number, limit = 20, offset: string | number = 0) => {
    const res = await apiClient.get(`/comment_v5/answers/${id}/root_comment?order_by=score&limit=${limit}&offset=${offset}`);
    res.data.data = (res.data.data || []).map(normalizeComment);
    return res.data;
};

export const getQuestionCommentsV5 = async (id: string | number, limit = 20, offset: string | number = 0) => {
    const res = await apiClient.get(`/comment_v5/questions/${id}/root_comment?order_by=score&limit=${limit}&offset=${offset}`);
    res.data.data = (res.data.data || []).map(normalizeComment);
    return res.data;
};

export const getArticleCommentsV5 = async (id: string | number, limit = 20, offset: string | number = 0) => {
    const res = await apiClient.get(`/comment_v5/articles/${id}/root_comment?order_by=score&limit=${limit}&offset=${offset}`);
    res.data.data = (res.data.data || []).map(normalizeComment);
    return res.data;
};

export const createArticleComment = async (id: string | number, content: string) => {
    const res = await apiClient.post(`/articles/${id}/comments`, {
        content,
        type: 'comment'
    });
    return res.data;
};

export const getChildCommentsV5 = async (id: string | number, limit = 20, offset: string | number = 0) => {
    const res = await apiClient.get(`/comment_v5/comments/${id}/child_comment?limit=${limit}&offset=${offset}`);
    res.data.data = (res.data.data || []).map(normalizeComment);
    return res.data;
};

/**
 * 格式化评论数据，兼容 v4 和 v5 结构
 */
const normalizeComment = (comment: any) => {
    if (!comment) return comment;

    // 1. 处理作者结构 (V5 扁平化了)
    if (comment.author && !comment.author.member) {
        comment.author = { member: { ...comment.author } };
    }

    // 2. 处理回复对象的作者结构
    if (comment.reply_to_author && !comment.reply_to_author.member) {
        comment.reply_to_author = { member: { ...comment.reply_to_author } };
    }

    // 3. 处理点赞数 (V5 是 like_count)
    if (comment.vote_count === undefined && comment.like_count !== undefined) {
        comment.vote_count = comment.like_count;
    }

    // 4. 处理点赞状态 (V5 是 liked)
    if (!comment.relationship && comment.liked !== undefined) {
        comment.relationship = {
            voting: comment.liked ? 1 : 0
        };
    }

    // 5. 递归处理子评论 (V5 有时候会自带部分子评论)
    if (comment.child_comments && Array.isArray(comment.child_comments)) {
        comment.child_comments = comment.child_comments.map(normalizeComment);
    }

    return comment;
};

