import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { hasAuthenticationCookie } from '@/api/client';
import type { ZhihuMember } from '@/api/zhihu';
import {
  fetchMemberCreations,
  type MemberCreationsResponse,
} from '@/api/zhihu/moments';
import { getAuthSessionVersion, useAuthStore } from '@/store/useAuthStore';
import { type MemberCreation, toMemberCreation } from '@/utils/memberCreations';
import { refreshInfiniteQuery } from '@/utils/query';
import { useRefreshAction } from './useRefreshAction';

/** The next page's URL, or undefined at the end or when it would repeat. */
export function getNextCreationsUrl(
  page: MemberCreationsResponse,
  currentUrl: string | null,
): string | undefined {
  const next = page.paging?.next;
  if (page.paging?.is_end || !next || next === currentUrl) return undefined;
  if (page.data.length === 0) return undefined;
  return next;
}

/**
 * 个人主页「创作」：App 同名标签使用的列表，回答、文章、想法按发布时间
 * 倒序排在一起，可以翻到最早的内容。绑定登录会话，并在未登录态下防止
 * 重复轮询需要鉴权的接口。
 */
export function useMemberCreations(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const cookies = useAuthStore((state) => state.cookies);
  const sessionVersion = useAuthStore(() => getAuthSessionVersion());
  const isAuthenticated = hasAuthenticationCookie(cookies);
  const memberId = member?.id;
  const queryKey = useMemo(
    () => ['user-creations', memberId, sessionVersion] as const,
    [memberId, sessionVersion],
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      if (!memberId) throw new Error('用户资料尚未加载');
      if (!isAuthenticated) throw new Error('请先登录');
      if (sessionVersion !== getAuthSessionVersion()) {
        throw new Error('登录状态已变化');
      }
      return fetchMemberCreations(memberId, pageParam ?? undefined, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _pages, lastUrl) =>
      getNextCreationsUrl(lastPage, lastUrl),
    enabled: enabled && isAuthenticated && Boolean(memberId),
  });
  const items = useMemo(() => {
    if (!isAuthenticated) return [];
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((page) => page.data) ?? []).flatMap(
      (card): MemberCreation[] => {
        const creation = toMemberCreation(card);
        if (!creation) return [];
        const key = `${creation.kind}:${creation.item.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [creation];
      },
    );
  }, [isAuthenticated, query.data]);
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return { ...query, queryKey, items, isAuthenticated, refresh, refreshing };
}
