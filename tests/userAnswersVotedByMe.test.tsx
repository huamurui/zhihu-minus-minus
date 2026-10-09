import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AxiosError, AxiosHeaders } from 'axios';
import type { PropsWithChildren } from 'react';
import apiClient from '../api/client';
import {
  getMemberAnswersVotedByMe,
  MEMBER_ANSWERS_INCLUDE,
  type ZhihuListResponse,
  type ZhihuMember,
} from '../api/zhihu/member';
import { useUserAnswersVotedByMe } from '../hooks/useUserAnswersVotedByMe';
import { useAuthStore } from '../store/useAuthStore';
import type { ZhihuAnswer } from '../types/zhihu';
import { shouldRetryQuery } from '../utils/query';

jest.mock('../api/client', () => ({
  __esModule: true,
  default: { get: jest.fn() },
  hasAuthenticationCookie: (cookies: string | null | undefined) =>
    typeof cookies === 'string' && /(?:^|;\s*)z_c0=[^;\s]+/.test(cookies),
}));

let mockSessionVersion = 1;
jest.mock('../store/useAuthStore', () => {
  const { create } = jest.requireActual('zustand');
  return {
    getAuthSessionVersion: () => mockSessionVersion,
    useAuthStore: create(() => ({
      cookies: null,
      activeAccountIndex: 0,
      me: { id: 'synthetic-current-viewer-id' },
    })),
  };
});

const member: ZhihuMember = {
  id: 'synthetic-member-id',
  type: 'people',
  url_token: 'synthetic-member-token',
  name: '合成用户',
  avatar_url: '',
};

function answer(id: string | number): ZhihuAnswer {
  return {
    id,
    type: 'answer',
    content: '<p>合成回答正文</p>',
    excerpt: '合成回答摘要',
    created_time: 100,
    updated_time: 200,
    comment_count: 3,
    voteup_count: 4,
    author: {
      id: member.id,
      type: 'people',
      url_token: member.url_token,
      name: member.name,
      avatar_url: '',
    },
    question: {
      id: 'synthetic-question-id',
      type: 'question',
      title: '合成问题',
    },
    relationship: { voting: 1 },
  };
}

function page(
  ids: (string | number)[],
  next = '',
  totals = ids.length,
): ZhihuListResponse<ZhihuAnswer> {
  return {
    data: ids.map(answer),
    paging: { is_end: !next, next, previous: '', totals },
  };
}

function setupClient(retry = false) {
  const client = new QueryClient({
    defaultOptions: {
      queries: {
        retry: retry ? shouldRetryQuery : false,
        retryDelay: 0,
        gcTime: Infinity,
      },
    },
  });
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  jest.mocked(apiClient.get).mockReset();
  mockSessionVersion = 1;
  useAuthStore.setState({ cookies: 'z_c0=synthetic-current-viewer' });
});

test('requests the target author answers upvoted by the current viewer with includes, sort, offset and cancellation signal', async () => {
  const response = page(['one']);
  response.data[0].endorsements = [
    { elements: [{ type: 'TEXT', content: '收录于 · 合成专栏' }] },
  ];
  const signal = new AbortController().signal;
  jest.mocked(apiClient.get).mockResolvedValue({ data: response });

  await expect(
    getMemberAnswersVotedByMe(member.url_token ?? member.id, 40, signal),
  ).resolves.toEqual(response);
  expect(MEMBER_ANSWERS_INCLUDE.split(',')).toContain('endorsements');
  expect(response.data[0].author.id).toBe(member.id);
  expect(response.data[0].author.id).not.toBe(useAuthStore.getState().me?.id);
  expect(apiClient.get).toHaveBeenCalledWith(
    '/members/synthetic-member-token/relations/vote',
    {
      signal,
      params: {
        include: MEMBER_ANSWERS_INCLUDE,
        limit: 20,
        offset: 40,
        sort_by: 'created',
        ws_qiangzhisafe: 0,
      },
    },
  );
});

test('waits for a member and an enabled tab, then falls back to the immutable member id', async () => {
  jest.mocked(apiClient.get).mockResolvedValue({ data: page(['one']) });
  const { client, wrapper } = setupClient();
  const host = await renderHook(
    ({
      value,
      enabled,
    }: {
      value: ZhihuMember | undefined;
      enabled: boolean;
    }) => useUserAnswersVotedByMe(value, enabled),
    {
      initialProps: {
        value: undefined as ZhihuMember | undefined,
        enabled: true,
      },
      wrapper,
    },
  );
  expect(apiClient.get).not.toHaveBeenCalled();
  await host.rerender({ value: member, enabled: false });
  expect(apiClient.get).not.toHaveBeenCalled();
  await host.rerender({ value: { ...member, url_token: '' }, enabled: true });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'user-answers-voted-by-me',
    member.id,
    mockSessionVersion,
  ]);
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/members/synthetic-member-id/relations/vote',
    expect.objectContaining({
      signal: expect.objectContaining({ aborted: false }),
      params: expect.objectContaining({ offset: 0 }),
    }),
  );
  await host.unmount();
  client.clear();
});

test('guests request no answers and cannot bypass authentication through a manual refetch', async () => {
  useAuthStore.setState({ cookies: null });
  jest.mocked(apiClient.get).mockResolvedValue({ data: page(['private']) });
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  expect(host.result.current.isAuthenticated).toBe(false);
  expect(host.result.current.answers).toEqual([]);
  expect(host.result.current.total).toBeUndefined();
  expect(apiClient.get).not.toHaveBeenCalled();
  await act(async () => {
    await host.result.current.refetch();
    await host.result.current.fetchNextPage();
    await host.result.current.refresh();
  });
  expect(apiClient.get).not.toHaveBeenCalled();
  expect(host.result.current.answers).toEqual([]);
  expect(host.result.current.total).toBeUndefined();
  await host.unmount();
  client.clear();
});

test('isolates viewer sessions even when their cookie values match, then hides results for a guest', async () => {
  let finishSecondViewer:
    | ((value: { data: ZhihuListResponse<ZhihuAnswer> }) => void)
    | undefined;
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({ data: page(['first-viewer']) })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishSecondViewer = resolve;
        }),
    );
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  const firstViewerKey = host.result.current.queryKey;
  expect(host.result.current.answers.map((item) => item.id)).toEqual([
    'first-viewer',
  ]);

  await act(async () => {
    mockSessionVersion += 1;
    useAuthStore.setState({ activeAccountIndex: 1 });
  });
  await waitFor(() => expect(finishSecondViewer).toBeDefined());
  expect(host.result.current.queryKey).toEqual([
    'user-answers-voted-by-me',
    member.url_token,
    2,
  ]);
  expect(host.result.current.answers).toEqual([]);
  expect(host.result.current.total).toBeUndefined();
  expect(client.getQueryData(firstViewerKey)).toEqual({
    pages: [page(['first-viewer'])],
    pageParams: [0],
  });
  expect(JSON.stringify(host.result.current.queryKey)).not.toContain(
    'synthetic-current-viewer',
  );
  await act(async () => {
    finishSecondViewer?.({ data: page(['second-viewer']) });
  });
  await waitFor(() =>
    expect(host.result.current.answers.map((item) => item.id)).toEqual([
      'second-viewer',
    ]),
  );
  const secondViewerKey = host.result.current.queryKey;

  await act(async () => {
    mockSessionVersion += 1;
    useAuthStore.setState({ cookies: null, activeAccountIndex: -1 });
  });
  await waitFor(() => expect(host.result.current.isAuthenticated).toBe(false));
  expect(host.result.current.queryKey).toEqual([
    'user-answers-voted-by-me',
    member.url_token,
    3,
  ]);
  expect(host.result.current.answers).toEqual([]);
  expect(host.result.current.total).toBeUndefined();
  expect(client.getQueryData(secondViewerKey)).toEqual({
    pages: [page(['second-viewer'])],
    pageParams: [0],
  });
  expect(apiClient.get).toHaveBeenCalledTimes(2);
  await host.unmount();
  client.clear();
});

test('reads the next offset, de-duplicates overlapping answers and obeys is_end', async () => {
  const finalPage = page([1, 'two'], '/relations/vote?offset=40', 2);
  finalPage.paging.is_end = true;
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({
      data: page(
        ['1'],
        '/relations/vote?limit=20&offset=20&sort_by=created',
        2,
      ),
    })
    .mockResolvedValueOnce({ data: finalPage });
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  expect(host.result.current.queryKey).toEqual([
    'user-answers-voted-by-me',
    member.url_token,
    mockSessionVersion,
  ]);
  expect(host.result.current.total).toBe(2);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  await waitFor(() =>
    expect(host.result.current.answers.map((item) => item.id)).toEqual([
      '1',
      'two',
    ]),
  );
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/members/synthetic-member-token/relations/vote',
    expect.objectContaining({
      params: expect.objectContaining({ offset: 20 }),
    }),
  );
  expect(host.result.current.hasNextPage).toBe(false);
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  expect(apiClient.get).toHaveBeenCalledTimes(2);
  await host.unmount();
  client.clear();
});

test('refresh clears pagination for only the exact key and tracks its pending state', async () => {
  let finishRefresh:
    | ((value: { data: ZhihuListResponse<ZhihuAnswer> }) => void)
    | undefined;
  jest
    .mocked(apiClient.get)
    .mockResolvedValueOnce({
      data: page(['one'], '/relations/vote?offset=20', 2),
    })
    .mockResolvedValueOnce({ data: page(['one', 'two'], '', 2) })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishRefresh = resolve;
        }),
    );
  const { client, wrapper } = setupClient();
  const relatedKey = [
    'user-answers-voted-by-me',
    member.url_token,
    mockSessionVersion,
    'unrelated',
  ];
  const otherKey = [
    'user-answers-voted-by-me',
    'other-member',
    mockSessionVersion,
  ];
  const untouched = { pages: [page(['other'])], pageParams: [0] };
  client.setQueryData(relatedKey, untouched);
  client.setQueryData(otherKey, untouched);
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.hasNextPage).toBe(true));
  await act(async () => {
    await host.result.current.fetchNextPage();
  });
  let refresh: Promise<void> | undefined;
  await act(async () => {
    refresh = host.result.current.refresh();
  });
  await waitFor(() => expect(host.result.current.refreshing).toBe(true));
  await waitFor(() => expect(finishRefresh).toBeDefined());
  expect(apiClient.get).toHaveBeenLastCalledWith(
    '/members/synthetic-member-token/relations/vote',
    expect.objectContaining({ params: expect.objectContaining({ offset: 0 }) }),
  );
  await act(async () => {
    finishRefresh?.({ data: page(['fresh']) });
    await refresh;
  });
  await waitFor(() => expect(host.result.current.refreshing).toBe(false));
  expect(host.result.current.answers.map((item) => item.id)).toEqual(['fresh']);
  expect(host.result.current.data?.pageParams).toEqual([0]);
  expect(client.getQueryData(relatedKey)).toEqual(untouched);
  expect(client.getQueryData(otherKey)).toEqual(untouched);
  await host.unmount();
  client.clear();
});

test('retries transient failures through the shared query policy', async () => {
  const failure = new AxiosError('合成服务异常');
  failure.response = {
    status: 503,
    statusText: 'Unavailable',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  jest
    .mocked(apiClient.get)
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce({ data: page(['retried']) });
  const { client, wrapper } = setupClient(true);
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(apiClient.get).toHaveBeenCalledTimes(2);
  expect(host.result.current.answers.map((item) => item.id)).toEqual([
    'retried',
  ]);
  await host.unmount();
  client.clear();
});

test('exposes errors and allows a manual retry after a non-transient failure', async () => {
  jest
    .mocked(apiClient.get)
    .mockRejectedValueOnce(new Error('合成请求失败'))
    .mockResolvedValueOnce({ data: page(['recovered']) });
  const { client, wrapper } = setupClient();
  const host = await renderHook(() => useUserAnswersVotedByMe(member), {
    wrapper,
  });
  await waitFor(() => expect(host.result.current.isError).toBe(true));
  expect(host.result.current.answers).toEqual([]);
  expect(host.result.current.total).toBeUndefined();
  await act(async () => {
    await host.result.current.refetch();
  });
  await waitFor(() => expect(host.result.current.isSuccess).toBe(true));
  expect(host.result.current.answers.map((item) => item.id)).toEqual([
    'recovered',
  ]);
  await host.unmount();
  client.clear();
});
