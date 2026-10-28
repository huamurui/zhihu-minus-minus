import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { ZhihuMember } from '@/api/zhihu';
import {
  fetchMemberCreations,
  type MemberCreationsResponse,
} from '@/api/zhihu/moments';
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
 * 倒序排在一起，可以翻到最早的内容。
 */
export function useMemberCreations(
  member: ZhihuMember | undefined,
  enabled = true,
) {
  const queryClient = useQueryClient();
  const memberId = member?.id;
  const queryKey = useMemo(
    () => ['user-creations', memberId] as const,
    [memberId],
  );
  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) => {
      if (!memberId) throw new Error('用户资料尚未加载');
      return fetchMemberCreations(memberId, pageParam ?? undefined, signal);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage, _pages, lastUrl) =>
      getNextCreationsUrl(lastPage, lastUrl),
    enabled: enabled && Boolean(memberId),
  });
  const items = useMemo(() => {
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
  }, [query.data]);
  const refreshAction = useCallback(
    () => refreshInfiniteQuery(queryClient, queryKey),
    [queryClient, queryKey],
  );
  const { refresh, refreshing } = useRefreshAction(refreshAction);
  return { ...query, queryKey, items, refresh, refreshing };
}
