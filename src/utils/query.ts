import type {
  GetNextPageParamFunction,
  QueryClient,
  QueryFunction,
  QueryKey,
  QueryOptions,
} from '@tanstack/react-query';
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

  // A disconnected transport already waits for its own timeout. Give it one
  // retry, then let reconnect handling or an explicit refresh start fresh.
  return axios.isAxiosError(error) && failureCount < 1;
}

interface CachedInfiniteQueryOptions
  extends Omit<
    QueryOptions<unknown, unknown, unknown, QueryKey>,
    'queryFn' | 'behavior'
  > {
  queryFn?: QueryFunction<unknown, QueryKey, unknown>;
  initialPageParam?: unknown;
  getNextPageParam?: GetNextPageParamFunction<unknown, unknown>;
}

/**
 * Refresh one TanStack infinite query without clearing the pages already on screen.
 * The first page is fetched with the query's registered fetcher and the cache is
 * replaced only after the request succeeds, so a failed pull keeps cached content.
 * `pages: 1` still limits the refresh to a single request instead of refetching
 * every page loaded so far.
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
  const query = queryClient.getQueryCache().find({ queryKey, exact: true });
  const options = query?.options as unknown as
    | CachedInfiniteQueryOptions
    | undefined;

  if (
    query?.queryType !== 'infinite' ||
    !options?.queryFn ||
    !options.getNextPageParam
  ) {
    // No cached pages to keep: let active observers reload through their own fetcher.
    await queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }

  try {
    await queryClient.fetchInfiniteQuery<
      unknown,
      unknown,
      unknown,
      QueryKey,
      unknown
    >({
      queryKey,
      queryFn: options.queryFn,
      getNextPageParam: options.getNextPageParam,
      initialPageParam: options.initialPageParam,
      pages: 1,
      staleTime: 0,
      retry: options.retry,
      retryDelay: options.retryDelay,
      networkMode: options.networkMode,
      meta: options.meta,
      gcTime: options.gcTime,
    });
  } catch {
    // Keep the cached pages visible; the next refresh or retry can recover.
  }
}
