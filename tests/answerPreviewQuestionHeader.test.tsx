import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import {
  followQuestion,
  getQuestion,
  type ZhihuQuestionDetail,
} from '../src/api/zhihu/question';
import { AnswerPreviewQuestionHeader } from '../src/components/AnswerPreviewQuestionHeader';

let mockSessionVersion = 1;
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: string }) => unknown) =>
    selector({ cookies: 'synthetic-authentication' }),
}));
jest.mock('../src/api/client', () => ({ hasAuthenticationCookie: () => true }));
jest.mock('../src/api/zhihu/question', () => ({
  getQuestion: jest.fn(),
  followQuestion: jest.fn(),
  unfollowQuestion: jest.fn(),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#555555',
    useRuntimeThemeColors: () => ({
      backgroundSecondary: '#eeeeee',
      link: '#123456',
    }),
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/ContentActionButton', () => ({
  ContentActionButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/FollowButton', () => ({
  FollowButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/MoreActionsButton', () => ({
  MoreActionsButton: () => null,
}));
jest.mock('../src/components/ShareMenu', () => ({ ShareMenu: () => null }));
jest.mock('../src/components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../src/features/rich-content', () => {
  const { Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RICH_CONTENT_BODY_FONT_SIZE: 17,
    RICH_CONTENT_STALE_TIME: 60_000,
    ZhihuContent: ({ content }: { content: string }) => <Text>{content}</Text>,
  };
});

const question: ZhihuQuestionDetail = {
  id: '7',
  type: 'question',
  title: '合成问题',
  topics: [],
  answer_count: 1,
  follower_count: 4,
  relationship: { is_following: false },
};
const clients: QueryClient[] = [];

function setupClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  clients.push(client);
  return {
    client,
    wrapper: ({ children }: PropsWithChildren) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  jest.mocked(getQuestion).mockReset().mockResolvedValue(question);
  jest.mocked(followQuestion).mockReset().mockResolvedValue({});
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('shows the fetched rich description immediately and lets the reader collapse and reopen it', async () => {
  const { wrapper } = setupClient();
  const detail = '<p>正文包含<strong>格式</strong>和图片</p>';
  const request = deferred<ZhihuQuestionDetail>();
  jest.mocked(getQuestion).mockReturnValueOnce(request.promise);
  const host = await render(
    <AnswerPreviewQuestionHeader id="7" title="路由标题" />,
    { wrapper },
  );
  expect(host.getByText('路由标题')).toBeTruthy();
  expect(getQuestion).toHaveBeenCalledWith('7', undefined, {
    signal: expect.any(AbortSignal),
  });
  await act(() =>
    request.resolve({ ...question, detail, excerpt: '问题摘要' }),
  );
  expect(await host.findByText(detail)).toBeTruthy();
  await fireEvent.press(host.getByText('收起问题描述'));
  expect(host.queryByText(detail)).toBeNull();
  expect(host.getByText('问题摘要')).toBeTruthy();
  await fireEvent.press(host.getByText('展开问题描述'));
  expect(host.getByText(detail)).toBeTruthy();
  expect(getQuestion).toHaveBeenCalledTimes(1);
});

test('shows the entire available excerpt when the question has no rich description', async () => {
  const { wrapper } = setupClient();
  const excerpt = '第一行\n第二行\n第三行\n第四行';
  jest.mocked(getQuestion).mockResolvedValueOnce({ ...question, excerpt });
  const host = await render(
    <AnswerPreviewQuestionHeader id="7" title="路由标题" />,
    { wrapper },
  );
  const description = await host.findByText(excerpt);
  expect(description.props.numberOfLines).toBeUndefined();
  expect(host.queryByText('展开问题描述')).toBeNull();
});

test('shares the question page cache for rendering, optimistic follow and settled refetch', async () => {
  const { client, wrapper } = setupClient();
  const questionPageKey = ['question', '7', true, 1];
  client.setQueryData(questionPageKey, question);
  const follow = deferred<unknown>();
  jest.mocked(followQuestion).mockReturnValueOnce(follow.promise);
  const host = await render(
    <AnswerPreviewQuestionHeader id="7" title="路由标题" />,
    { wrapper },
  );
  expect(host.getByText('合成问题')).toBeTruthy();
  expect(getQuestion).not.toHaveBeenCalled();

  await fireEvent.press(host.getByLabelText('关注问题'));
  await waitFor(() =>
    expect(
      client.getQueryData<ZhihuQuestionDetail>(questionPageKey)?.relationship
        ?.is_following,
    ).toBe(true),
  );
  expect(host.getByLabelText('取消关注问题')).toBeTruthy();
  expect(followQuestion).toHaveBeenCalledWith('7');
  jest.mocked(getQuestion).mockResolvedValueOnce({
    ...question,
    follower_count: 5,
    relationship: { is_following: true },
  });
  await act(() => follow.resolve({}));
  await waitFor(() => expect(getQuestion).toHaveBeenCalledTimes(1));
  expect(getQuestion).toHaveBeenCalledWith('7', undefined, {
    signal: expect.any(AbortSignal),
  });

  // A mutation by the question page reaches the mounted preview immediately.
  await act(() => client.setQueryData(questionPageKey, question));
  await waitFor(() => expect(host.getByLabelText('关注问题')).toBeTruthy());
});

test('a new account cannot reuse the previous account question cache', async () => {
  const { client, wrapper } = setupClient();
  client.setQueryData(['question', '7', true, 1], {
    ...question,
    relationship: { is_following: true },
  });
  const host = await render(
    <AnswerPreviewQuestionHeader id="7" title="路由标题" />,
    { wrapper },
  );
  expect(host.getByLabelText('取消关注问题')).toBeTruthy();
  const nextAccount = deferred<ZhihuQuestionDetail>();
  jest.mocked(getQuestion).mockReturnValueOnce(nextAccount.promise);
  mockSessionVersion = 2;
  await host.rerender(<AnswerPreviewQuestionHeader id="7" title="路由标题" />);
  expect(host.queryByLabelText('取消关注问题')).toBeNull();
  await act(() => nextAccount.resolve(question));
  await waitFor(() => expect(host.getByLabelText('关注问题')).toBeTruthy());
  expect(
    client.getQueryData<ZhihuQuestionDetail>(['question', '7', true, 2]),
  ).toEqual(question);
});
