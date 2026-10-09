import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import {
  getMemberColumnContributions,
  type ZhihuMember,
} from '@/api/zhihu/member';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { refreshInfiniteQuery } from '@/utils/query';
import { useRefreshAction } from './useRefreshAction';
import { useZhihuInfiniteQuery } from './useZhihuInfiniteQuery';

/** Columns associated with the profile, isolated by the current login session. */
export function useUserColumns(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const targetId = member?.url_token || member?.id;
  const queryKey = useMemo(
    () => ['user-columns', targetId, sessionVersion] as const,
    [targetId, sessionVersion],
  );
  const query = useZhihuInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam, signal }) => {
      if (!targetId) throw new Error('用户资料尚未加载');
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new Error('登录状态已变化');
      }
      const page = await getMemberColumnContributions(
        targetId,
        pageParam,
        signal,
      );
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new Error('登录状态已变化');
      }
      return page;
    },
    initialPageParam: 0,
    enabled: enabled && Boolean(targetId),
  });
  const columns = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.data) ?? []).flatMap(
      ({ column }) => {
        if (seen.has(column.id)) return [];
        seen.add(column.id);
        return [column];
      },
    );
  }, [query.data]);
  const total = query.data?.pages[0]?.paging.totals;
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return { ...query, queryKey, columns, total, refresh, refreshing };
}
