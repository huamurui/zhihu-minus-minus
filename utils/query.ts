import type { QueryClient, QueryKey } from '@tanstack/react-query';
import axios from 'axios';

function getResponseStatus(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.status;
}

function isVerificationError(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  const data = error.response?.data;
  if (!data || typeof data !== 'object' || !('error' in data)) return false;
  const detail = data.error;
  return (
    typeof detail === 'object' &&
    detail !== null &&
    'code' in detail &&
    detail.code === 40352
  );
}

/** Retry only transient request failures; client errors need user/action changes. */
export function shouldRetryQuery(
  failureCount: number,
  error: unknown,
): boolean {
  if (axios.isCancel(error)) return false;
  if (isVerificationError(error)) return false;

  const status = getResponseStatus(error);
  if (status !== undefined) {
    return status === 408 || status === 429 || status >= 500
      ? failureCount < 2
      : false;
  }

  return axios.isAxiosError(error) && failureCount < 2;
}

/**
 * Reset one TanStack infinite query to its initial state and refetch active observers.
 * resetQueries clears every cached page/pageParam for the exact key, so pull-to-refresh
 * requests only the initial page instead of refetching every page loaded so far.
 *
 * @param queryClient The active QueryClient instance
 * @param queryKey The query key of the infinite query
 * The optional trailing arguments remain for compatibility with existing callers.
 */
export async function refreshInfiniteQuery(
  queryClient: QueryClient,
  queryKey: QueryKey,
  _refetch?: () => Promise<unknown>,
  _initialPageParam?: unknown,
) {
  // 重置 InfiniteQuery：清空已加载的所有翻页缓存及 pageParams，回到初始第 1 页重新抓取
  return queryClient.resetQueries({ queryKey, exact: true });
}
