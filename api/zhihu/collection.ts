import apiClient from '../client';

export const getMyCollections = async (limit = 20, offset = 0) => {
    const res = await apiClient.get(`/members/me/collections?limit=${limit}&offset=${offset}`);
    return res.data;
};

export const getCollection = async (id: string | number) => {
    const res = await apiClient.get(`/collections/${id}`);
    return res.data;
};

export const getCollectionDetail = async (id: string | number, limit = 20, offset = 0) => {
    const include = 'data[*].content,voteup_count,comment_count,created_time,updated_time,excerpt,question.title,relationship.voting';
    const res = await apiClient.get(`/collections/${id}/contents?limit=${limit}&offset=${offset}&include=${include}`);
    return res.data;
};
