import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { getSearchSuggest, searchContent } from '../src/api/zhihu';
import type { FeedItem } from '../src/api/zhihu/feed';
import SearchScreen from '../src/app/search';

const mockFeedItems = new Map<string, FeedItem>();

jest.mock('../src/api/zhihu', () => ({
  getSearchSuggest: jest.fn(),
  searchContent: jest.fn(),
}));
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 58, bottom: 34, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#123456',
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/overlays/BottomSheet', () => ({
  BottomSheet: () => null,
}));
jest.mock('../src/components/FeedCard', () => ({
  FeedCard: ({ item }: { item: FeedItem }) => {
    mockFeedItems.set(item.id, item);
    return jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Text, null, item.title);
  },
}));
jest.mock('../src/components/UserCard', () => ({ UserCard: () => null }));
jest.mock('../src/store/useSearchStore', () => ({
  useSearchStore: () => ({
    history: ['历史关键词'],
    addHistory: jest.fn(),
    clearHistory: jest.fn(),
    removeHistory: jest.fn(),
  }),
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data: unknown[];
    renderItem: (args: { item: unknown }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
  }) =>
    jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').View,
        null,
        data.length
          ? data.map((item) =>
              jest
                .requireActual('react')
                .createElement(
                  jest.requireActual('react').Fragment,
                  { key: keyExtractor(item) },
                  renderItem({ item }),
                ),
            )
          : ListEmptyComponent,
        ListFooterComponent,
      ),
}));

let client: QueryClient;
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockFeedItems.clear();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  jest.mocked(getSearchSuggest).mockResolvedValue({ suggest: [] });
  jest
    .mocked(searchContent)
    .mockResolvedValue({ data: [], paging: { is_end: true, next: '' } });
});
afterEach(async () => {
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  client.clear();
  jest.useRealTimers();
});

const flushQueries = async () => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(350);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
};

const renderSearch = () =>
  render(
    <QueryClientProvider client={client}>
      <SearchScreen />
    </QueryClientProvider>,
  );

test('search history starts its own query immediately without waiting for input debounce', async () => {
  const host = await renderSearch();
  await fireEvent.press(host.getByText('历史关键词'));
  expect(searchContent).toHaveBeenCalledTimes(1);
  expect(searchContent).toHaveBeenLastCalledWith(
    '历史关键词',
    0,
    20,
    'general',
    expect.any(Object),
  );
});

test('search tabs expose their selection and switch the result type', async () => {
  const host = await renderSearch();
  await fireEvent.press(host.getByText('历史关键词'));
  expect(
    host.getByRole('tab', { name: '综合' }).props.accessibilityState,
  ).toEqual({ selected: true });

  await fireEvent.press(host.getByRole('tab', { name: '用户' }));
  expect(
    host.getByRole('tab', { name: '用户' }).props.accessibilityState,
  ).toEqual({ selected: true });
  expect(searchContent).toHaveBeenLastCalledWith(
    '历史关键词',
    0,
    20,
    'people',
    expect.any(Object),
  );
});

test('suggestion selection never searches the previous input prefix', async () => {
  jest
    .mocked(getSearchSuggest)
    .mockResolvedValue({ suggest: [{ query: '完整建议词' }] });
  const host = await renderSearch();
  await fireEvent.changeText(
    host.getByPlaceholderText('搜索知乎内容...'),
    '建议',
  );
  await flushQueries();
  expect(host.getByText('完整建议词')).toBeTruthy();
  await fireEvent.press(host.getByText('完整建议词'));
  expect(searchContent).toHaveBeenCalledTimes(1);
  expect(searchContent).toHaveBeenCalledWith(
    '完整建议词',
    0,
    20,
    'general',
    expect.any(Object),
  );
});

test('editing shows neither search history nor stale suggestions while waiting for new suggestions', async () => {
  jest
    .mocked(getSearchSuggest)
    .mockResolvedValue({ suggest: [{ query: '完整建议词' }] });
  const host = await renderSearch();
  const input = host.getByLabelText('搜索知乎内容');

  expect(host.getByText('历史关键词')).toBeTruthy();
  await fireEvent.changeText(input, '建议');
  expect(host.queryByText('历史关键词')).toBeNull();
  await flushQueries();
  expect(host.getByText('完整建议词')).toBeTruthy();

  await fireEvent.changeText(input, '新词');
  expect(host.queryByText('历史关键词')).toBeNull();
  expect(host.queryByText('完整建议词')).toBeNull();

  await fireEvent.press(host.getByLabelText('清空搜索'));
  expect(host.getByText('历史关键词')).toBeTruthy();
});

test('submission trims the query and a later suggestion debounce does not replace it', async () => {
  const host = await renderSearch();
  await fireEvent.changeText(
    host.getByPlaceholderText('搜索知乎内容...'),
    '  C++  ',
  );
  await fireEvent.press(host.getByText('搜索'));
  expect(searchContent).toHaveBeenCalledWith(
    'C++',
    0,
    20,
    'general',
    expect.any(Object),
  );
  await flushQueries();
  expect(searchContent).toHaveBeenCalledTimes(1);
});

test('duplicate content and unsupported search cards are excluded while question titles remain visible', async () => {
  const answer = {
    type: 'search_result' as const,
    highlight: {},
    index: 0,
    object: { id: 'a', type: 'answer', question: { title: '回答所属问题' } },
  };
  jest.mocked(searchContent).mockResolvedValue({
    data: [
      answer,
      answer,
      {
        ...answer,
        object: { id: 'ad', type: 'promotion', title: '无效视频卡片' },
      },
    ],
    paging: { is_end: true, next: '' },
  });
  const host = await renderSearch();
  await fireEvent.press(host.getByText('历史关键词'));
  await flushQueries();
  expect(host.getAllByText('回答所属问题')).toHaveLength(1);
  expect(host.queryByText('无效视频卡片')).toBeNull();
  expect(host.getByText('已加载 1 条')).toBeTruthy();
});

test('search preserves the API namespace of Lens and zvideo results', async () => {
  jest.mocked(searchContent).mockResolvedValue({
    data: [
      {
        type: 'search_result',
        index: 0,
        highlight: {},
        object: { id: '2088306465639604943', type: 'video', title: 'Lens视频' },
      },
      {
        type: 'search_result',
        index: 1,
        highlight: {},
        object: {
          id: '2088306465639604944',
          type: 'zvideo',
          title: '独立视频',
        },
      },
    ],
    paging: { is_end: true, next: '' },
  });
  const host = await renderSearch();
  await fireEvent.press(host.getByText('历史关键词'));
  await flushQueries();
  expect(mockFeedItems.get('2088306465639604943')).toMatchObject({
    type: 'videos',
    videoSource: 'lens',
  });
  expect(mockFeedItems.get('2088306465639604944')).toMatchObject({
    type: 'videos',
    videoSource: 'zvideo',
  });
});
