import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { voteContent } from '../api/zhihu';
import { useDoubleTapAction } from '../hooks/useDoubleTapAction';
import { updateContentInteractionCaches } from '../utils/contentCache';
import { impactAsync } from '../utils/haptics';
import { showToast } from '../utils/toast';

jest.mock('../api/zhihu', () => ({
  voteContent: jest.fn(),
  getVoteSuccessMessage: jest.fn(() => '已赞同'),
}));
jest.mock('../utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../utils/haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../utils/zhihuError', () => ({
  getZhihuErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : '失败',
}));

const voteContentMock = jest.mocked(voteContent);
const updateCachesMock = jest.mocked(updateContentInteractionCaches);

let queryClient: QueryClient;

function wrapper({ children }: PropsWithChildren) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient();
});

function setup(options: Partial<Parameters<typeof useDoubleTapAction>[0]> = {}) {
  return renderHook(
    (props: Parameters<typeof useDoubleTapAction>[0]) =>
      useDoubleTapAction(props),
    {
      initialProps: {
        id: 'answer-1',
        type: 'answers' as const,
        ...options,
      },
      wrapper,
    },
  );
}
const endEvent = { state: 5 } as never;

test('double tap upvotes through the shared interaction cache', async () => {
  voteContentMock.mockResolvedValue({ voted: 1, voteCount: 8 });
  const host = await setup({ voted: 0, count: 7 });

  await act(() => host.result.current.gesture.handlers.onEnd?.(endEvent, true));

  expect(impactAsync).toHaveBeenCalledTimes(1);
  expect(voteContentMock).toHaveBeenCalledWith('answer-1', 'answers', 'up');
  expect(updateCachesMock).toHaveBeenCalledWith(queryClient, {
    type: 'answers',
    id: 'answer-1',
    voted: 1,
    voteCount: 8,
  });
  expect(showToast).toHaveBeenCalledWith('已赞同');
  await host.unmount();
});

test('falls back to local count when the API omits one', async () => {
  voteContentMock.mockResolvedValue({ voted: 1 });
  const host = await setup({ voted: 0, count: 7 });

  await act(() => host.result.current.gesture.handlers.onEnd?.(endEvent, true));

  expect(updateCachesMock).toHaveBeenCalledWith(
    queryClient,
    expect.objectContaining({ voteCount: 8 }),
  );
  await host.unmount();
});

test('double tap on already upvoted content only gives feedback', async () => {
  const host = await setup({ voted: 1, count: 8 });

  await act(() => host.result.current.gesture.handlers.onEnd?.(endEvent, true));

  expect(impactAsync).toHaveBeenCalledTimes(1);
  expect(voteContentMock).not.toHaveBeenCalled();
  expect(updateCachesMock).not.toHaveBeenCalled();
  expect(showToast).not.toHaveBeenCalled();
  await host.unmount();
});

test('a failed or cancelled tap never upvotes', async () => {
  const host = await setup({ voted: 0, count: 7 });

  await act(() =>
    host.result.current.gesture.handlers.onEnd?.(endEvent, false),
  );

  expect(voteContentMock).not.toHaveBeenCalled();
  await host.unmount();
});

test('a rejected vote reports the error and leaves the cache untouched', async () => {
  voteContentMock.mockRejectedValue(new Error('需要登录'));
  const host = await setup({ voted: 0, count: 7 });

  await act(() => host.result.current.gesture.handlers.onEnd?.(endEvent, true));

  expect(updateCachesMock).not.toHaveBeenCalled();
  expect(showToast).toHaveBeenCalledWith('需要登录');
  await host.unmount();
});

test('rapid double taps collapse into a single request', async () => {
  let resolveVote: (value: { voted: 1; voteCount: number }) => void = () => {};
  voteContentMock.mockReturnValue(
    new Promise((resolve) => {
      resolveVote = resolve;
    }),
  );
  const host = await setup({ voted: 0, count: 7 });
  const trigger = host.result.current.gesture.handlers.onEnd;

  await act(async () => {
    void trigger?.(endEvent, true);
    void trigger?.(endEvent, true);
    resolveVote({ voted: 1, voteCount: 8 });
  });

  expect(voteContentMock).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('the disabled gesture keeps its double-tap config without voting', async () => {
  const host = await setup({ voted: 0, count: 7, enabled: false });

  expect(host.result.current.gesture.config.numberOfTaps).toBe(2);
  expect(host.result.current.gesture.config.enabled).toBe(false);
  await host.unmount();
});
