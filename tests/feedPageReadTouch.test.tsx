import {
  type InfiniteData,
  notifyManager,
  QueryClient,
  QueryClientProvider,
  useInfiniteQuery,
} from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import type { RawFeedItem } from '../src/api/zhihu/feed';
import { touchAnswersRead } from '../src/api/zhihu/lastRead';
import { useFeedPageReadTouch } from '../src/hooks/useFeedPageReadTouch';
import { getNextUnvisitedFeedPage } from '../src/utils/feedPagination';
import {
  createFeedReadTouchBatch,
  type FeedReadTouchBatch,
} from '../src/utils/feedReadTouch';

jest.mock('../src/api/zhihu/lastRead', () => ({ touchAnswersRead: jest.fn() }));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null) => Boolean(cookie),
}));
let mockActive = true;
let mockSessionVersion = 1;
let mockCookies: string | null = 'synthetic-authentication';
jest.mock('../src/hooks/useActiveScreen', () => ({
  useActiveScreen: () => mockActive,
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: Object.assign(
    (selector: (state: { cookies: string | null }) => unknown) =>
      selector({ cookies: mockCookies }),
    { getState: () => ({ cookies: mockCookies }) },
  ),
}));

interface ApiPage {
  rawItems: RawFeedItem[];
  renderedIds: string[];
  nextUrl: string | null;
}

interface FeedPage {
  items: string[];
  nextUrl: string | null;
  readTouchBatch?: FeedReadTouchBatch | null;
}

interface FeedProps {
  scope: string;
  enabled: boolean;
  active: boolean;
}

const clients: QueryClient[] = [];
const initialProps: FeedProps = {
  scope: 'recommend-account-a',
  enabled: true,
  active: true,
};

beforeAll(() => {
  // Keep asynchronous observer notifications inside the awaited React act scope.
  notifyManager.setScheduler(queueMicrotask);
});

afterAll(() => {
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

function apiPage(ids: string[], nextUrl: string | null): ApiPage {
  return {
    rawItems: ids.map((id) => ({ type: 'answer', id })),
    renderedIds: ids,
    nextUrl,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function setup(
  options: {
    firstPage?: ApiPage;
    initialData?: InfiniteData<FeedPage, string>;
    props?: Partial<FeedProps>;
  } = {},
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
    },
  });
  clients.push(client);
  const fetchPage = jest.fn(
    async (pageParam: string, _scope: string): Promise<ApiPage> => {
      switch (pageParam) {
        case 'page-1':
          return options.firstPage ?? apiPage(['101', '102'], 'page-2');
        case 'page-2':
          return apiPage(['201', '202'], 'page-3');
        default:
          return apiPage(['301'], null);
      }
    },
  );
  const host = await renderHook(
    ({ scope, enabled, active }: FeedProps) => {
      mockActive = active;
      const queryKey = ['feed-touch', scope];
      const query = useInfiniteQuery({
        queryKey,
        queryFn: async ({ pageParam }): Promise<FeedPage> => {
          const sessionVersion = mockSessionVersion;
          const response = await fetchPage(pageParam, scope);
          return {
            items: response.renderedIds,
            nextUrl: response.nextUrl,
            readTouchBatch: createFeedReadTouchBatch(
              response.rawItems,
              sessionVersion,
            ),
          };
        },
        initialPageParam: 'page-1',
        initialData: options.initialData,
        getNextPageParam: (lastPage, _pages, _lastParam, pageParams) =>
          getNextUnvisitedFeedPage(lastPage.nextUrl, pageParams),
      });
      const next = useFeedPageReadTouch(queryKey, query.fetchNextPage, enabled);
      return { ...query, next };
    },
    {
      initialProps: { ...initialProps, ...options.props },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  return { client, fetchPage, host };
}

beforeEach(() => {
  mockActive = true;
  mockSessionVersion = 1;
  mockCookies = 'synthetic-authentication';
  jest.mocked(touchAnswersRead).mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('captures direct and nested answers, preserves large string IDs, and excludes other targets and invalid IDs', () => {
  const batch = createFeedReadTouchBatch(
    [
      { type: 'answer', id: '9007199254740993001' },
      { type: 'feed', id: 'wrapper', target: { type: 'answer', id: '102' } },
      { type: 'answer', id: 103 },
      { type: 'answer', id: ' 102 ' },
      { type: 'answer', id: ' 000104 ' },
      { type: 'answer', id: '' },
      { type: 'answer', id: '  ' },
      { type: 'answer' },
      { type: 'answer', id: Number.MAX_SAFE_INTEGER + 1 },
      { type: 'answer', id: Number.NaN },
      { type: 'answer', id: 1.5 },
      { type: 'question', id: 'question' },
      { type: 'article', id: 'article' },
      { type: 'pin', id: 'pin' },
      { type: 'zvideo', id: 'video' },
      {
        type: 'answer',
        id: 'outer-answer',
        target: { type: 'question', id: 'inner-question' },
      },
    ],
    7,
  );
  expect(batch.answerIds).toEqual([
    '9007199254740993001',
    '102',
    '103',
    '000104',
  ]);
  expect(batch.sessionVersion).toBe(7);
});

test('next-page loading reports the complete raw response even when cards are hidden, filtered, or never rendered', async () => {
  const firstPage = apiPage(['visible', 'filtered', 'offscreen'], 'page-2');
  firstPage.renderedIds = ['visible'];
  const { host } = await setup({ firstPage });
  expect(host.result.current.data?.pages[0].items).toEqual(['visible']);
  expect(touchAnswersRead).not.toHaveBeenCalled();

  await act(() => host.result.current.next());

  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
  expect(touchAnswersRead).toHaveBeenCalledWith(
    ['visible', 'filtered', 'offscreen'],
    { sessionVersion: 1 },
  );
});

test('initial loading and refetching do not report reads; each next page reports only the preceding response', async () => {
  const { host } = await setup();
  await act(() => host.result.current.refetch());
  expect(touchAnswersRead).not.toHaveBeenCalled();

  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenNthCalledWith(1, ['101', '102'], {
    sessionVersion: 1,
  });
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenNthCalledWith(2, ['201', '202'], {
    sessionVersion: 1,
  });
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledTimes(2);
});

test('repeated callbacks during next-page loading send one batch and do not duplicate the pending page request', async () => {
  const { fetchPage, host } = await setup();
  const nextPage = deferred<ApiPage>();
  const touch = deferred<void>();
  fetchPage.mockReturnValueOnce(nextPage.promise);
  jest.mocked(touchAnswersRead).mockReturnValueOnce(touch.promise);

  await act(() => {
    void host.result.current.next();
    void host.result.current.next();
    void host.result.current.next();
  });
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
  await act(() => nextPage.resolve(apiPage(['201'], 'page-3')));
  await waitFor(() => expect(host.result.current.isFetching).toBe(false));

  // A slow feedback request cannot prevent later batches from advancing.
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenNthCalledWith(2, ['201'], {
    sessionVersion: 1,
  });
  await act(() => touch.resolve());
});

test('retrying a failed next-page request does not repeat a successful touch', async () => {
  const { fetchPage, host } = await setup();
  fetchPage.mockRejectedValueOnce(new Error('synthetic next-page failure'));
  await act(() => host.result.current.next());
  await waitFor(() =>
    expect(host.result.current.isFetchNextPageError).toBe(true),
  );
  expect(host.result.current.data?.pages).toHaveLength(1);

  await act(() => host.result.current.next());

  await waitFor(() => expect(host.result.current.data?.pages).toHaveLength(2));
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
});

test('feedback failure cannot block pagination and may be retried when advancing the same page again', async () => {
  const { fetchPage, host } = await setup();
  const nextPage = deferred<ApiPage>();
  fetchPage.mockReturnValueOnce(nextPage.promise);
  jest
    .mocked(touchAnswersRead)
    .mockRejectedValueOnce(new Error('synthetic feedback failure'));
  await act(() => {
    void host.result.current.next();
  });
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
  await act(() => nextPage.reject(new Error('synthetic next-page failure')));
  await waitFor(() =>
    expect(host.result.current.isFetchNextPageError).toBe(true),
  );

  await act(() => host.result.current.next());

  await waitFor(() => expect(host.result.current.data?.pages).toHaveLength(2));
  expect(touchAnswersRead).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).toHaveBeenLastCalledWith(['101', '102'], {
    sessionVersion: 1,
  });
});

test('a new refresh response with identical IDs is a new reportable batch', async () => {
  const { fetchPage, host } = await setup();
  fetchPage.mockRejectedValueOnce(new Error('synthetic next-page failure'));
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
  await act(() => host.result.current.refetch());
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);

  await act(() => host.result.current.next());

  expect(touchAnswersRead).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).toHaveBeenLastCalledWith(['101', '102'], {
    sessionVersion: 1,
  });
});

test.each([
  { active: false, enabled: true },
  { active: true, enabled: false },
])('inactive or disabled lists cannot advance or report: %j', async (props) => {
  const { fetchPage, host } = await setup({ props });
  await act(() => host.result.current.next());
  expect(fetchPage).toHaveBeenCalledTimes(1);
  expect(touchAnswersRead).not.toHaveBeenCalled();

  await host.rerender(initialProps);
  await act(() => host.result.current.next());
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);
});

test('guests may paginate without sending authenticated read feedback', async () => {
  mockCookies = null;
  const { host } = await setup();
  await act(() => host.result.current.next());
  await waitFor(() => expect(host.result.current.data?.pages).toHaveLength(2));
  expect(touchAnswersRead).not.toHaveBeenCalled();
});

test('old callbacks and old-account batches cannot send reads after a session switch', async () => {
  const { fetchPage, host } = await setup();
  const oldNext = host.result.current.next;
  mockSessionVersion = 2;
  await act(() => oldNext());
  expect(fetchPage).toHaveBeenCalledTimes(1);
  expect(touchAnswersRead).not.toHaveBeenCalled();

  await host.rerender(initialProps);
  await act(() => host.result.current.next());
  await waitFor(() => expect(host.result.current.data?.pages).toHaveLength(2));
  expect(touchAnswersRead).not.toHaveBeenCalled();
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledWith(['201', '202'], {
    sessionVersion: 2,
  });
});

test('switching list scope rejects stale callbacks and isolates new response batches', async () => {
  const { fetchPage, host } = await setup();
  fetchPage.mockRejectedValueOnce(new Error('synthetic next-page failure'));
  await act(() => host.result.current.next());
  const oldNext = host.result.current.next;
  await host.rerender({ ...initialProps, scope: 'following-account-a' });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  const requestsBefore = fetchPage.mock.calls.length;
  await act(() => oldNext());
  expect(fetchPage).toHaveBeenCalledTimes(requestsBefore);
  expect(touchAnswersRead).toHaveBeenCalledTimes(1);

  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledTimes(2);
  expect(fetchPage).toHaveBeenLastCalledWith('page-2', 'following-account-a');
});

test('launch-cache pages without raw response metadata are skipped, while subsequent live batches are reported', async () => {
  const { fetchPage, host } = await setup({
    initialData: {
      pages: [{ items: ['cached-only'], nextUrl: 'page-2' }],
      pageParams: ['page-1'],
    },
  });
  expect(fetchPage).not.toHaveBeenCalled();
  await act(() => host.result.current.next());
  expect(touchAnswersRead).not.toHaveBeenCalled();
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledWith(['201', '202'], {
    sessionVersion: 1,
  });
});

test('empty answer batches do not produce requests and cyclic next links do not advance or report', async () => {
  const { fetchPage, host } = await setup({
    firstPage: {
      rawItems: [{ type: 'question', id: 'question-only' }],
      renderedIds: ['question-only'],
      nextUrl: 'page-2',
    },
  });
  fetchPage.mockResolvedValueOnce(apiPage(['201'], 'page-1'));
  await act(() => host.result.current.next());
  expect(touchAnswersRead).not.toHaveBeenCalled();
  await act(() => host.result.current.next());
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).not.toHaveBeenCalled();
});

test('a pending refresh cannot be canceled by pagination or report the obsolete batch', async () => {
  const { fetchPage, host } = await setup();
  const refreshed = deferred<ApiPage>();
  fetchPage.mockReturnValueOnce(refreshed.promise);
  await act(() => {
    void host.result.current.refetch();
    void host.result.current.next();
  });
  expect(fetchPage).toHaveBeenCalledTimes(2);
  expect(touchAnswersRead).not.toHaveBeenCalled();
  await act(() => refreshed.resolve(apiPage(['refreshed'], 'page-2')));
  await waitFor(() => expect(host.result.current.isFetching).toBe(false));
  await act(() => host.result.current.next());
  expect(touchAnswersRead).toHaveBeenCalledWith(['refreshed'], {
    sessionVersion: 1,
  });
});

test('returns descriptive status for started, blocked, and ended pagination outcomes', async () => {
  const { fetchPage, host } = await setup();
  // 1. Successful trigger -> started
  const nextResult = await act(() => host.result.current.next());
  expect(nextResult.status).toBe('started');
  await waitFor(() => expect(host.result.current.isFetching).toBe(false));

  // 2. In-flight operation -> blocked (busy)
  const pending = deferred<ApiPage>();
  fetchPage.mockReturnValueOnce(pending.promise);
  void host.result.current.next();
  const busyResult = await act(() => host.result.current.next());
  expect(busyResult).toEqual({ status: 'blocked', reason: 'busy' });
  await act(() => pending.resolve(apiPage(['301'], null)));
  await waitFor(() => expect(host.result.current.isFetching).toBe(false));

  // 3. Reached end of feed (nextUrl: null) -> ended (exhausted)
  const exhaustedResult = await act(() => host.result.current.next());
  expect(exhaustedResult).toEqual({ status: 'ended', reason: 'exhausted' });
});
