import apiClient from '../client';

export const getSearchSuggest = async (query: string) => {
    const res = await apiClient.get(`/search/suggest?q=${encodeURIComponent(query)}`);
    return res.data;
};

export const searchContent = async (query: string, offset = 0, limit = 20) => {
    const params = new URLSearchParams({
        t: 'general',
        q: query,
        correction: '1',
        offset: offset.toString(),
        limit: limit.toString(),
        filter_fields: '',
        lc_idx: '0',
        show_all_topics: '0',
        search_source: 'Normal'
    });
    const res = await apiClient.get(`/search_v3?${params.toString()}`);
    return res.data;
};
