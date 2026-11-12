import {
  InfiniteQueryObserver,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import { batchDelReadHistory } from '../src/api/zhihu/history';
import { useReadHistoryActions } from '../src/hooks/useReadHistoryActions';

jest.mock('../src/api/zhihu/history', () => ({
  batchDelReadHistory: jest.fn(),
}));
let mockSession = 0;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSession,
}));

async function setup() {
  const client = new QueryClient();
  const host = await renderHook(() => useReadHistoryActions(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { client, host };
}

function observeHistory(client: QueryClient) {
  const requests: number[] = [];
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ['read-history'],
    initialPageParam: 0,
    initialData: { pages: ['old history'], pageParams: [0] },
    staleTime: Infinity,
    queryFn: async ({ pageParam }) => {
      requests.push(pageParam);
      return 'new history';
    },
    getNextPageParam: () => undefined,
  });
  const unsubscribe = observer.subscribe(() => undefined);
  return { requests, unsubscribe };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession = 0;
});

test('overlapping clear and delete actions perform one request and refresh only history', async () => {
  let finish: () => void = () => {};
  jest.mocked(batchDelReadHistory).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  const history = observeHistory(client);
  client.setQueryData(['unrelated-list'], 'keep');
  let first: Promise<boolean> | undefined;
  let duplicate: Promise<boolean> | undefined;
  await act(() => {
    first = host.result.current.deleteHistory({ clear: true });
    duplicate = host.result.current.deleteHistory({
      clear: false,
      pairs: [{ content_token: '42', content_type: 'answer' }],
    });
  });
  expect(await duplicate).toBe(false);
  expect(batchDelReadHistory).toHaveBeenCalledTimes(1);
  expect(host.result.current.isPending).toBe(true);
  await act(async () => {
    finish();
    await first;
  });
  expect(await first).toBe(true);
  expect(history.requests).toEqual([0]);
  expect(client.getQueryData(['read-history'])).toEqual({
    pages: ['new history'],
    pageParams: [0],
  });
  expect(client.getQueryData(['unrelated-list'])).toBe('keep');
  expect(host.result.current.isPending).toBe(false);
  history.unsubscribe();
  await host.unmount();
  client.clear();
});

test('late deletion cannot clear or refresh the next account history', async () => {
  let finish: () => void = () => {};
  jest.mocked(batchDelReadHistory).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  const history = observeHistory(client);
  let deletion: Promise<boolean> | undefined;
  await act(() => {
    deletion = host.result.current.deleteHistory({ clear: true });
  });
  await act(async () => {
    mockSession += 1;
    client.setQueryData(['read-history'], {
      pages: ['next-account'],
      pageParams: [0],
    });
    finish();
    await deletion;
  });
  expect(await deletion).toBe(false);
  expect(history.requests).toEqual([]);
  expect(client.getQueryData(['read-history'])).toEqual({
    pages: ['next-account'],
    pageParams: [0],
  });
  history.unsubscribe();
  await host.unmount();
  client.clear();
});
