import {
  InfiniteQueryObserver,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
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

function flush() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function createObservedQuery() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const requests: Array<{
    pageParam: number;
    signal: AbortSignal;
    result: ReturnType<typeof deferred<number>>;
  }> = [];
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ['refresh-target'],
    initialPageParam: 0,
    initialData: { pages: [10, 20, 30], pageParams: [0, 1, 2] },
    staleTime: Infinity,
    maxPages: 3,
    queryFn: ({ pageParam, signal }) => {
      const result = deferred<number>();
      requests.push({ pageParam, signal, result });
      return result.promise;
    },
    getNextPageParam: (lastPage) => lastPage + 1,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { client, observer, requests, unsubscribe };
}

afterEach(() => {
  onlineManager.setOnline(true);
});

test('keeps cached pages during refresh and replaces them only after the first page succeeds', async () => {
  const { client, requests, unsubscribe } = createObservedQuery();

  const refresh = refreshInfiniteQuery(client, ['refresh-target']);
  await flush();

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
  await flush();
  requests[0].result.reject(new Error('synthetic network failure'));

  await expect(refresh).resolves.toBeUndefined();
  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [10, 20, 30],
    pageParams: [0, 1, 2],
  });
  const options = client.getQueryCache().find({
    queryKey: ['refresh-target'],
  })?.options as { maxPages?: number } | undefined;
  expect(options?.maxPages).toBe(3);
  unsubscribe();
});

test('resolves without a request while offline', async () => {
  const { client, requests, unsubscribe } = createObservedQuery();
  onlineManager.setOnline(false);

  await expect(
    refreshInfiniteQuery(client, ['refresh-target']),
  ).resolves.toBeUndefined();

  expect(requests).toHaveLength(0);
  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [10, 20, 30],
    pageParams: [0, 1, 2],
  });
  unsubscribe();
});

test('skips refresh while every observer is disabled', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const requests: number[] = [];
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ['disabled-refresh'],
    initialPageParam: 0,
    enabled: false,
    queryFn: async ({ pageParam }) => {
      requests.push(pageParam);
      return 1;
    },
    getNextPageParam: () => undefined,
  });
  const unsubscribe = observer.subscribe(() => undefined);

  await expect(
    refreshInfiniteQuery(client, ['disabled-refresh']),
  ).resolves.toBeUndefined();

  expect(requests).toEqual([]);
  unsubscribe();
});

test('cancels an in-flight pagination fetch before requesting the first page', async () => {
  const { client, observer, requests, unsubscribe } = createObservedQuery();
  const nextPage = observer.fetchNextPage();
  expect(requests.map((request) => request.pageParam)).toEqual([31]);

  const refresh = refreshInfiniteQuery(client, ['refresh-target']);
  await flush();
  await nextPage;

  expect(requests.map((request) => request.pageParam)).toEqual([31, 0]);
  expect(requests[0].signal.aborted).toBe(true);

  requests[1].result.resolve(99);
  await refresh;
  expect(client.getQueryData(['refresh-target'])).toEqual({
    pages: [99],
    pageParams: [0],
  });
  unsubscribe();
});
