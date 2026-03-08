import apiClient from '../client';

export const MEMBER_INCLUDE = 'url_token,answer_count,articles_count,question_count,pins_count,follower_count,following_count,headline,cover_url,description,voteup_count,thanked_count,favorited_count,is_following,mutual_followees_count';

export const getMember = async (id: string | number, include?: string) => {
    const res = await apiClient.get(`/members/${id}?include=${include || MEMBER_INCLUDE}`);
    return res.data;
};

export const getMemberActivities = async (id: string | number, limit = 20, offset = 0) => {
    const url = `https://www.zhihu.com/api/v3/moments/${id}/activities?limit=${limit}&offset=${offset}`;
    const res = await apiClient.get(url, {
        headers: {
            'x-api-version': '3.0.40'
        }
    });
    return res.data;
};

export const getMemberRelations = async (id: string | number, type: 'answers' | 'questions' | 'articles' | 'pins', params: { limit?: number; offset?: number; include?: string; sort_by?: string }) => {
    let endpoint = `/members/${id}/${type}`;
    const res = await apiClient.get(endpoint, { params });
    return res.data;
};

export const followMember = async (id: string | number) => {
    const res = await apiClient.post(`/members/${id}/followers/`);
    return res.data;
};

export const unfollowMember = async (id: string | number) => {
    const res = await apiClient.delete(`/members/${id}/followers/`);
    return res.data;
};

export const getMemberFollowers = async (id: string | number, limit = 20, offset = 0) => {
    const res = await apiClient.get(`/members/${id}/followers?limit=${limit}&offset=${offset}`);
    return res.data;
};

export const getMemberFollowing = async (id: string | number, limit = 20, offset = 0) => {
    const res = await apiClient.get(`/members/${id}/followees?limit=${limit}&offset=${offset}`);
    return res.data;
};

export const getMemberMutual = async (id: string | number, limit = 20, offset = 0) => {
    const res = await apiClient.get(`/members/${id}/mutual-followees?limit=${limit}&offset=${offset}`);
    return res.data;
};
