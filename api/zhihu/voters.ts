import apiClient from '../client';

export interface ZhihuApiErrorDetail {
  code: number;
  name: string;
  message: string;
  [key: string]: unknown;
}

export interface ZhihuErrorResponse {
  error: ZhihuApiErrorDetail;
}

export interface ZhihuVoteResponse {
  success?: boolean;
  [key: string]: unknown;
}

export const voteContent = async (
  id: string | number,
  type: 'answers' | 'articles' | 'questions' | 'pins' | 'comments',
  voteType: 'up' | 'neutral' | 'down' | 'like' | 'unlike',
): Promise<ZhihuVoteResponse> => {
  if (type === 'pins') {
    if (voteType === 'like' || voteType === 'up') {
      const res = await apiClient.post<ZhihuVoteResponse>(
        `/pins/${id}/voters/up`,
        {
          not_sync_moments: true,
        },
      );
      return res.data;
    } else {
      const res = await apiClient.delete<ZhihuVoteResponse>(
        `/pins/${id}/voters/up`,
      );
      return res.data;
    }
  } else if (type === 'comments') {
    if (voteType === 'up' || voteType === 'like') {
      const res = await apiClient.post<ZhihuVoteResponse>(
        `/comments/${encodeURIComponent(String(id))}/like`,
      );
      return res.data;
    } else {
      const res = await apiClient.delete<ZhihuVoteResponse>(
        `/comments/${encodeURIComponent(String(id))}/like`,
      );
      return res.data;
    }
  } else {
    const res = await apiClient.post<ZhihuVoteResponse>(
      `/${type}/${id}/voters`,
      {
        type: voteType,
      },
    );
    return res.data;
  }
};
