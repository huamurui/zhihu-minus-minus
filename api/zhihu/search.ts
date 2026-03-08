import apiClient from '../client';

export const getSearchSuggest = async (query: string) => {
    const res = await apiClient.get(`/search/suggest?q=${encodeURIComponent(query)}`);
    return res.data;
};

export const searchContent = async (query: string, offset = 0, limit = 20, type = 'general', options?: { restricted_scene?: string, restricted_field?: string, restricted_value?: string }) => {
    const params = new URLSearchParams({
        t: type,
        q: query,
        correction: '1',
        offset: offset.toString(),
        limit: limit.toString(),
        filter_fields: '',
        lc_idx: '0',
        show_all_topics: '0',
        search_source: 'Normal'
    });
    if (options?.restricted_scene) params.append('restricted_scene', options.restricted_scene);
    if (options?.restricted_field) params.append('restricted_field', options.restricted_field);
    if (options?.restricted_value) params.append('restricted_value', options.restricted_value);

    const res = await apiClient.get(`/search_v3?${params.toString()}`);
    return res.data;
};
