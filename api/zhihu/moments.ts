import type { ZhihuPaging } from '@/types/zhihu';
import apiClient from '../client';

// ==========================================
// 1. 类型定义
// ==========================================

export interface ZhihuActor {
  id: string;
  url_token: string;
  name: string;
  avatar_url: string;
}

export interface RecentMomentItem {
  /** Some response variants expose the read token as the feed entry id. */
  id?: string;
  /** Opaque token used by the recent-person read endpoint. */
  brief?: string;
  actor: ZhihuActor;
  unread_count: number;
}

export interface RecentMomentsResponse {
  data: RecentMomentItem[];
  paging: ZhihuPaging;
}

// ==========================================
// 2. 请求函数
// ==========================================

/**
 * 获取最近有更新的关注用户列表及未读数量
 *
 * @returns 包含有新动态的用户列表和分页信息的 Promise
 */
export const fetchRecentMoments = async (): Promise<RecentMomentsResponse> => {
  const url = 'https://api.zhihu.com/moments/recent?type=raw';
  const response = await apiClient.get<RecentMomentsResponse>(url);
  return response.data;
};

export interface MarkRecentMomentsReadResponse {
  success: boolean;
}

/** Mark one recent-person entry as read using its opaque response token. */
export const markRecentMomentsRead = async (
  readToken: string,
): Promise<MarkRecentMomentsReadResponse> => {
  const url = 'https://api.zhihu.com/moments/recent/read';
  const response = await apiClient.post<MarkRecentMomentsReadResponse>(
    url,
    undefined,
    {
      params: { brief: readToken },
      headers: {
        'x-api-version': '3.0.93',
        'x-page-id': '10103',
      },
    },
  );
  return response.data;
};
