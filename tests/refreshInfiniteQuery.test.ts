import { InfiniteQueryObserver, QueryClient } from '@tanstack/react-query';
import { refreshInfiniteQuery } from '../src/utils/query';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createObservedQuery() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const requests: Array<{
    pageParam: number;
    result: ReturnType<typeof deferred<number>>;
  }> = [];
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ['refresh-target'],
    initialPageParam: 0,
    initialData: { pages: [10, 20, 30], pageParams: [0, 1, 2] },
    staleTime: Infinity,
    queryFn: ({ pageParam }) => {
      const result = deferred<number>();
      requests.push({ pageParam, result });
      return result.promise;
    },
    getNextPageParam: (lastPage) => lastPage + 1,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { client, observer, requests, unsubscribe };
}

test('keeps cached pages during refresh and replaces them only after the first page succeeds', async () => {
  const { client, requests, unsubscribe } = createObservedQuery();

  const refresh = refreshInfiniteQuery(client, ['refresh-target']);

  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [10, 20, 30],
    pageParams: [0, 1, 2],
  });
  expect(requests.map((request) => request.pageParam)).toEqual([0]);

  requests[0].result.resolve(99);
  await refresh;

  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [99],
    pageParams: [0],
  });
  unsubscribe();
});

test('keeps cached pages and resolves when a refresh request fails', async () => {
  const { client, requests, unsubscribe } = createObservedQuery();

  const refresh = refreshInfiniteQuery(client, ['refresh-target']);
  requests[0].result.reject(new Error('synthetic network failure'));

  await expect(refresh).resolves.toBeUndefined();
  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [10, 20, 30],
    pageParams: [0, 1, 2],
  });
  unsubscribe();
});
