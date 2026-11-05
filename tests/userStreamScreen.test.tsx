import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Animated, StyleSheet } from 'react-native';
import type { ZhihuMemberActivity } from '../src/api/zhihu/member';
import type { RecentMomentItem } from '../src/api/zhihu/moments';
import UserStreamScreen from '../src/app/user/[id]/stream';
import { PaneContext } from '../src/features/adaptive-layout/PaneContext';

const mockParams: { id: string; unreadCount?: string; source?: string } = {
  id: 'member-token',
  unreadCount: '3',
};
let mockMoments: RecentMomentItem[] | undefined;
const mockMarkRead = jest.fn();
const mockPush = jest.fn();
let mockMemberLoading = false;
const mockSetPage = jest.fn();
const mockRefresh = jest.fn();
const mockFetchNextPage = jest.fn();
const mockQuery = {
  activities: [] as ZhihuMemberActivity[],
  isLoading: false,
  isError: false,
  hasNextPage: true,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  isFetching: false,
  refreshing: false,
  refresh: mockRefresh,
  fetchNextPage: mockFetchNextPage,
  refetch: jest.fn(),
};

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ...props
  }: {
    data: Array<{ key: string }>;
    renderItem: (info: { item: { key: string } }) => ReactNode;
    keyExtractor: (item: { key: string }) => string;
  }) => {
    const React = jest.requireActual('react');
    const { View } = jest.requireActual('react-native');
    return React.createElement(
      View,
      { testID: 'published-stream-list', ...props },
      data.map((item) =>
        React.createElement(
          View,
          { key: keyExtractor(item) },
          renderItem({ item }),
        ),
      ),
    );
  },
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: () => (mockMoments ? { data: mockMoments } : undefined),
  }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data: mockMemberLoading
      ? undefined
      : {
          id: queryKey[1],
          url_token: queryKey[1],
          name: `合成用户 ${queryKey[1]}`,
          type: 'people',
          avatar_url: '',
        },
    isLoading: mockMemberLoading,
    isError: false,
    refetch: jest.fn(),
  }),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('../src/hooks/useMarkRecentMomentRead', () => ({
  useMarkRecentMomentRead: () => mockMarkRead,
}));
jest.mock('react-native-pager-view', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(
      (props: { children: ReactNode }, ref: unknown) => {
        React.useImperativeHandle(ref, () => ({ setPage: mockSetPage }));
        return React.createElement(View, props, props.children);
      },
    ),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/api/zhihu', () => ({ getMemberWithFallback: jest.fn() }));
jest.mock('../src/hooks/useUserCreations', () => ({
  useUserCreations: () => mockQuery,
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
}));
jest.mock('../src/components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../src/components/FeedCard', () => ({
  FeedCard: ({ item }: { item: { id: string } }) =>
    jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Text, null, item.id),
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(() => ({}), {
    getState: () => ({
      primaryColor: null,
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
    }),
  }),
}));

function activity(id: string): ZhihuMemberActivity {
  return { id: `event-${id}`, target: { id, type: 'answer' } };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.id = 'member-token';
  mockParams.unreadCount = '3';
  delete mockParams.source;
  mockMoments = undefined;
  mockMemberLoading = false;
  mockQuery.activities = ['a', 'b', 'c'].map(activity);
  mockQuery.refreshing = false;
  mockQuery.isFetching = false;
  mockRefresh.mockResolvedValue(undefined);
  mockFetchNextPage.mockResolvedValue(undefined);
});

test('refresh removes the entry unread marker and prevents pagination until the refresh settles', async () => {
  let finish: () => void = () => {};
  mockRefresh.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const host = await render(<UserStreamScreen />);
  expect(host.getByText('已看完本次更新')).toBeTruthy();
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(mockFetchNextPage).not.toHaveBeenCalled();
  expect(host.queryByText('已看完本次更新')).toBeNull();

  mockQuery.activities = ['new', 'a', 'b', 'c'].map(activity);
  await act(() => finish());
  await host.rerender(<UserStreamScreen />);
  expect(host.queryByText('已看完本次更新')).toBeNull();
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('refreshing query state blocks pagination and a rejected refresh can be retried', async () => {
  const host = await render(<UserStreamScreen />);
  mockQuery.refreshing = true;
  await host.rerender(<UserStreamScreen />);
  await fireEvent(host.getByTestId('published-stream-list'), 'endReached');
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  expect(mockFetchNextPage).not.toHaveBeenCalled();
  expect(mockRefresh).not.toHaveBeenCalled();

  mockQuery.refreshing = false;
  mockRefresh.mockRejectedValueOnce(new Error('合成刷新失败'));
  await host.rerender(<UserStreamScreen />);
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  await act(async () => {});
  await fireEvent(host.getByTestId('published-stream-list'), 'refresh');
  expect(mockRefresh).toHaveBeenCalledTimes(2);
  expect(host.queryByText('已看完本次更新')).toBeNull();
  await host.unmount();
});

function moment(id: string, unreadCount = 3): RecentMomentItem {
  return {
    brief: `synthetic-${id}`,
    actor: {
      id: `id-${id}`,
      url_token: id,
      name: `用户 ${id}`,
      avatar_url: '',
    },
    unread_count: unreadCount,
  };
}

async function selectPage(
  host: Awaited<ReturnType<typeof render>>,
  position: number,
) {
  await fireEvent(host.getByTestId('recent-moment-pager'), 'pageSelected', {
    nativeEvent: { position },
  });
}

test('the entry transition animates the list while keeping the user toolbar fixed and usable', async () => {
  const progress = new Animated.Value(0.5);
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const host = await render(
      <PaneContext.Provider
        value={{
          width: 390,
          height: 844,
          visible: true,
          fixedHeaderEntryProgress: progress,
        }}
      >
        <UserStreamScreen />
      </PaneContext.Provider>,
    );
    const content = host.getByTestId('published-stream-entry-content');
    expect(StyleSheet.flatten(content.props.style).transform).toBeDefined();
    expect(within(content).getByTestId('published-stream-list')).toBeVisible();
    expect(within(content).queryByRole('button', { name: '返回' })).toBeNull();
    expect(host.getByRole('button', { name: '返回' })).toBeEnabled();
    expect(
      within(content).queryByRole('link', {
        name: '查看合成用户 member-token的主页',
      }),
    ).toBeNull();
    await fireEvent.press(
      host.getByRole('link', { name: '查看合成用户 member-token的主页' }),
    );
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(timing).not.toHaveBeenCalled();
    await host.unmount();
  } finally {
    timing.mockRestore();
  }
});

test('the user information opens the current user profile after changing pages', async () => {
  mockParams.id = 'first';
  mockParams.source = 'recent-moments';
  mockMoments = [moment('first'), moment('second')];
  const host = await render(<UserStreamScreen />);
  await fireEvent.press(
    host.getByRole('link', { name: '查看合成用户 first的主页' }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/user/[id]',
    params: { id: 'first', name: '合成用户 first' },
  });
  await selectPage(host, 1);
  await fireEvent.press(
    host.getByRole('link', { name: '查看合成用户 second的主页' }),
  );
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/user/[id]',
    params: { id: 'second', name: '合成用户 second' },
  });
  expect(mockPush).toHaveBeenCalledTimes(2);
  await host.unmount();
});

test('the cached user information remains a usable profile link while details load', async () => {
  mockParams.id = 'first';
  mockParams.source = 'recent-moments';
  mockMemberLoading = true;
  const entry = moment('first');
  entry.actor.avatar_url = 'https://example.test/avatar.jpg';
  mockMoments = [entry];
  const host = await render(<UserStreamScreen />);
  await fireEvent.press(
    host.getByRole('link', { name: '查看用户 first的主页' }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]',
    params: {
      id: 'first',
      name: '用户 first',
      avatar: 'https://example.test/avatar.jpg',
    },
  });
  await host.unmount();
});

test('starts at the tapped user and marks only selected pages, preserving strip order across refreshes', async () => {
  mockParams.id = 'middle';
  mockParams.source = 'recent-moments';
  const entries = ['first', 'middle', 'last', 'distant'].map((id) =>
    moment(id),
  );
  mockMoments = entries;
  const host = await render(<UserStreamScreen />);
  expect(host.getByTestId('recent-moment-pager').props.initialPage).toBe(1);
  expect(host.getByText('合成用户 middle')).toBeTruthy();
  expect(mockMarkRead).toHaveBeenCalledTimes(1);
  expect(mockMarkRead).toHaveBeenLastCalledWith(entries[1]);
  expect(
    host.queryByText('合成用户 distant', { includeHiddenElements: true }),
  ).toBeNull();

  await selectPage(host, 2);
  expect(host.getByText('合成用户 last')).toBeTruthy();
  expect(mockMarkRead).toHaveBeenLastCalledWith(entries[2]);
  expect(mockMarkRead).toHaveBeenCalledTimes(2);

  mockMoments = [moment('new'), entries[2], entries[0]];
  await host.rerender(<UserStreamScreen />);
  expect(host.getByText('合成用户 last')).toBeTruthy();
  expect(
    host.queryByText('合成用户 new', { includeHiddenElements: true }),
  ).toBeNull();
  await selectPage(host, 0);
  expect(host.getByText('合成用户 first')).toBeTruthy();
  expect(mockMarkRead).toHaveBeenLastCalledWith(entries[0]);
  expect(host.getByRole('button', { name: '上一位用户' })).toBeDisabled();
  await selectPage(host, 3);
  expect(host.getByRole('button', { name: '下一位用户' })).toBeDisabled();
  expect(host.getByText('合成用户 distant')).toBeTruthy();
  await host.unmount();
});

test('paging back preserves each user unread boundary and ignores offscreen pagination', async () => {
  mockParams.id = 'first';
  mockParams.source = 'recent-moments';
  mockMoments = ['first', 'second', 'third', 'fourth'].map((id) => moment(id));
  const host = await render(<UserStreamScreen />);
  const activeList = host.getByTestId('published-stream-list');
  const inactiveList = host.getAllByTestId('published-stream-list', {
    includeHiddenElements: true,
  })[1];
  await fireEvent(inactiveList, 'endReached');
  expect(mockFetchNextPage).not.toHaveBeenCalled();
  expect(host.getByText('已看完本次更新')).toBeTruthy();
  await fireEvent(activeList, 'refresh');
  expect(host.queryByText('已看完本次更新')).toBeNull();

  await selectPage(host, 1);
  expect(host.getByText('已看完本次更新')).toBeTruthy();
  await selectPage(host, 3);
  await selectPage(host, 0);
  expect(host.getByTestId('published-stream-list')).toBe(activeList);
  expect(host.queryByText('已看完本次更新')).toBeNull();
  await host.unmount();
});

test('page buttons ask the pager to navigate; only confirmed selection marks read', async () => {
  mockParams.id = 'first';
  mockParams.source = 'recent-moments';
  mockMoments = ['first', 'second'].map((id) => moment(id));
  const host = await render(<UserStreamScreen />);
  await fireEvent.press(host.getByRole('button', { name: '下一位用户' }));
  expect(mockSetPage).toHaveBeenCalledWith(1);
  expect(mockMarkRead).toHaveBeenCalledTimes(1);
  expect(host.getByText('合成用户 first')).toBeTruthy();
  await selectPage(host, -1);
  await selectPage(host, 2);
  await selectPage(host, 0.5);
  expect(mockMarkRead).toHaveBeenCalledTimes(1);
  await selectPage(host, 1);
  expect(host.getByText('合成用户 second')).toBeTruthy();
  expect(mockMarkRead).toHaveBeenCalledTimes(2);
  await host.unmount();
});

test.each([undefined, 'recent-moments'])(
  'direct entry or missing cache remains a single usable user page (source=%s)',
  async (source) => {
    mockParams.source = source;
    mockMoments = source ? undefined : [moment('unrelated')];
    const host = await render(<UserStreamScreen />);
    expect(host.getByText('合成用户 member-token')).toBeTruthy();
    expect(host.getByTestId('recent-moment-pager').props.scrollEnabled).toBe(
      false,
    );
    expect(host.queryByRole('button', { name: '下一位用户' })).toBeNull();
    expect(mockMarkRead).not.toHaveBeenCalled();
    await host.unmount();
  },
);
