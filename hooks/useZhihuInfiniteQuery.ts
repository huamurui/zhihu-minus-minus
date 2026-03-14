import {
  UseInfiniteQueryOptions,
  useInfiniteQuery,
} from '@tanstack/react-query';

export function useZhihuInfiniteQuery<TData = any>(options: any) {
  return useInfiniteQuery({
    ...options,
    getNextPageParam: (lastPage: any) => {
      if (!lastPage || lastPage.paging?.is_end) return undefined;
      const nextUrl = lastPage.paging?.next;
      const match = nextUrl?.match(/offset=(\d+)/);
      return match ? parseInt(match[1], 10) : undefined;
    },
  } as any) as any;
}
