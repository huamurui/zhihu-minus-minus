import {
  type GetNextPageParamFunction,
  onlineManager,
  type QueryClient,
  type QueryFunction,
  type QueryKey,
  type QueryOptions,
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
    'queryFn' | 'behavior' | 'persister' | 'initialData'
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
 * every page loaded so far. In-flight fetches for the same key are cancelled first
 * so an ongoing pagination request cannot swallow the refresh, and offline pulls
 * resolve immediately instead of leaving the refresh indicator waiting.
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

  // A disabled query (for example the signed-out creations tab) shows its own
  // prompt; forcing a fetch would replace it with the query function's error.
  if (query?.isDisabled()) return;

  if (
    query?.queryType !== 'infinite' ||
    !options?.queryFn ||
    !options.getNextPageParam
  ) {
    // No cached pages to keep: let active observers reload through their own fetcher.
    await queryClient.invalidateQueries({ queryKey, exact: true });
    return;
  }

  if (
    (options.networkMode ?? 'online') === 'online' &&
    !onlineManager.isOnline()
  ) {
    return;
  }

  await queryClient.cancelQueries({ queryKey, exact: true });
  const previousState = query.state;

  try {
    await queryClient.fetchInfiniteQuery<
      unknown,
      unknown,
      unknown,
      QueryKey,
      unknown
    >({
      ...options,
      queryKey,
      queryFn: options.queryFn,
      getNextPageParam: options.getNextPageParam,
      initialPageParam: options.initialPageParam,
      pages: 1,
      staleTime: 0,
    });
  } catch (error) {
    // Keep the cached pages and their success state: list screens treat a query
    // error as a failed next page and stop automatic pagination.
    if (
      previousState.status === 'success' &&
      previousState.data !== undefined &&
      query.state.error === error
    ) {
      queryClient.setQueryData(queryKey, previousState.data, {
        updatedAt: previousState.dataUpdatedAt,
      });
    }
  }
}
