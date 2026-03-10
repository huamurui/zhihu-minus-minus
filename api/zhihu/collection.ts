import { useAuthStore } from '@/store/useAuthStore';
import apiClient from '../client';

const COLLECTION_INCLUDE = 'data[*].updated_time,answer_count,follower_count,creator,description,is_following,comment_count,created_time;data[*].creator.kvip_info;data[*].creator.vip_info';

export const getMyCollections = async (limit = 20, offset = 0) => {
    const me = useAuthStore.getState().me;
    const userId = me?.url_token || 'me';
    const res = await apiClient.get(`/people/${userId}/collections?limit=${limit}&offset=${offset}&include=${COLLECTION_INCLUDE}`);
    return res.data;
};

export const getUserCollections = async (userId: string, limit = 20, offset = 0) => {
    const res = await apiClient.get(`/people/${userId}/collections?limit=${limit}&offset=${offset}&include=${COLLECTION_INCLUDE}`);
    return res.data;
};

export const getCollection = async (id: string | number) => {
    const res = await apiClient.get(`/collections/${id}`);
    return res.data;
};

export const getCollectionDetail = async (id: string | number, limit = 20, offset = 0) => {
    // 使用 /items 接口
    const res = await apiClient.get(`/collections/${id}/items?limit=${limit}&offset=${offset}`);
    return res.data;
};

export const createCollection = async (data: { title: string; description: string; is_public: boolean }) => {
    const res = await apiClient.post('/collections', data);
    return res.data;
};

export const updateCollection = async (id: string | number, data: { title: string; description: string; is_public: boolean }) => {
    const res = await apiClient.put(`/collections/${id}`, data);
    return res.data;
};

export const deleteCollection = async (id: string | number) => {
    const res = await apiClient.delete(`/collections/${id}`);
    return res.data;
};

/**
 * 获取回答被收藏的状态及所属收藏夹列表
 * GET /collections/contents/answer/{answer_id}
 */
export const getAnswerCollectionStatus = async (answerId: string | number, limit = 5, offset = 0) => {
    const res = await apiClient.get(`/collections/contents/answer/${answerId}`, {
        params: { limit, offset }
    });
    return res.data;
};

/**
 * 添加到收藏夹
 * POST /collections/{collection_id}/contents?content_id={answer_id}&content_type=answer
 */
export const addToCollection = async (collectionId: string | number, answerId: string | number) => {
    const res = await apiClient.post(`/collections/${collectionId}/contents`, null, {
        params: {
            content_id: answerId,
            content_type: 'answer'
        }
    });
    return res.data;
};

/**
 * 从收藏夹中删除
 * DELETE /collections/{collection_id}/contents/{answer_id}?content_type=answer
 */
export const removeFromCollection = async (collectionId: string | number, answerId: string | number) => {
    const res = await apiClient.delete(`/collections/${collectionId}/contents/${answerId}`, {
        params: {
            content_type: 'answer'
        }
    });
    return res.data;
};

/**
 * 快速收藏到默认收藏夹
 * POST /collections/contents/answer/{answer_id}
 */
export const fastCollectAnswer = async (answerId: string | number) => {
    const res = await apiClient.post(`/collections/contents/answer/${answerId}`);
    return res.data;
};
