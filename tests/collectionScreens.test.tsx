import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import {
  getCollection,
  getCollectionDetail,
  getMyCollections,
  updateCollection,
} from '../src/api/zhihu';
import CollectionDetailScreen from '../src/app/collections/[id]';
import MyCollectionsScreen from '../src/app/collections/index';
import { CollectionSelectorModal } from '../src/components/CollectionSelectorModal';
import { collectionSelectorStatusKey } from '../src/hooks/useCollectionSelectionToggle';
import { useCollectionStore } from '../src/store/useCollectionStore';

let mockCookies: string | null = 'z_c0=synthetic';
const mockNavigation = { setOptions: jest.fn() };
const mockRouter = { push: jest.fn() };
const mockVideoTypes = new Map<string, string | undefined>();
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookies: string | null) => Boolean(cookies),
}));
jest.mock('../src/api/zhihu', () => ({
  getCollection: jest.fn(),
  getCollectionDetail: jest.fn(),
  getMyCollections: jest.fn(),
  createCollection: jest.fn(),
  updateCollection: jest.fn(),
  deleteCollection: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useNavigation: () => mockNavigation,
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '17' }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { cookies: string | null }) => unknown) =>
    selector({ cookies: mockCookies }),
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return { Text: native.Text, View: native.View, useThemeColor: () => '#00f' };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/CreationCard', () => ({
  CreationCard: ({
    item,
    type,
  }: {
    item: { id: string; type?: string };
    type: string;
  }) => {
    if (type === 'video') mockVideoTypes.set(item.id, item.type);
    return jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        null,
        `${type}:${item.id}`,
      );
  },
}));
jest.mock('../src/components/overlays/SheetScrollView', () => ({
  SheetScrollView: jest.requireActual('react-native').ScrollView,
}));
jest.mock('../src/components/overlays/BottomSheet', () => ({
  BottomSheet: ({
    visible,
    children,
    headerLeft,
    headerRight,
    dismissible = true,
    onClose,
  }: {
    visible: boolean;
    children: ReactNode;
    headerLeft?: ReactNode;
    headerRight?: ReactNode;
    dismissible?: boolean;
    onClose: () => void;
  }) => {
    const { createElement } = jest.requireActual('react');
    const { View, Pressable, Text } = jest.requireActual('react-native');
    return visible
      ? createElement(
          View,
          {
            testID: 'collection-editor',
            accessibilityState: { busy: !dismissible },
          },
          headerLeft,
          headerRight,
          children,
          createElement(
            Pressable,
            { disabled: !dismissible, onPress: onClose },
            createElement(Text, null, '关闭收藏夹'),
          ),
        )
      : null;
  },
}));
jest.mock('../src/components/overlays/ActionSheet', () => ({
  ActionSheet: ({
    visible,
    options,
  }: {
    visible: boolean;
    options: Array<{ key: string; label: string; onPress: () => void }>;
  }) => {
    const { createElement } = jest.requireActual('react');
    const { Pressable, Text } = jest.requireActual('react-native');
    return visible
      ? options.map((option) =>
          createElement(
            Pressable,
            { key: option.key, onPress: option.onPress },
            createElement(Text, null, option.label),
          ),
        )
      : null;
  },
}));
jest.mock('../src/components/CollectionEditorForm', () => ({
  CollectionEditorForm: ({ onSubmit }: { onSubmit: () => void }) => {
    const { createElement } = jest.requireActual('react');
    const { Pressable, Text } = jest.requireActual('react-native');
    return createElement(
      Pressable,
      { onPress: onSubmit },
      createElement(Text, null, '保存收藏夹'),
    );
  },
}));
jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
    onRefresh,
    ListEmptyComponent,
    keyExtractor,
    refreshing,
  }: {
    refreshing: boolean;
    keyExtractor: (item: unknown) => string;
    data: unknown[];
    renderItem: (info: { item: unknown }) => ReactNode;
    onRefresh?: () => void;
    ListEmptyComponent: () => ReactNode;
  }) => {
    const { createElement } = jest.requireActual('react');
    const { View, Pressable, Text } = jest.requireActual('react-native');
    return createElement(
      View,
      { testID: 'collection-list', accessibilityState: { busy: refreshing } },
      onRefresh
        ? createElement(
            Pressable,
            { onPress: onRefresh },
            createElement(Text, null, '刷新'),
          )
        : null,
      data.length
        ? data.map((item) =>
            createElement(
              View,
              { key: keyExtractor(item) },
              renderItem({ item }),
            ),
          )
        : createElement(ListEmptyComponent),
    );
  },
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCookies = 'z_c0=synthetic';
  jest.mocked(getMyCollections).mockResolvedValue({
    data: [{ id: 17, title: '合成收藏夹', is_public: true }],
    paging: { is_end: true, next: '' },
  });
});

test('back from creating a folder returns to the open collection selector', async () => {
  const client = createClient();
  client.setQueryData(collectionSelectorStatusKey('1', 'answer'), {
    data: [],
  });
  useCollectionStore.getState().openSelector('1', 'answer');
  const host = await render(
    <QueryClientProvider client={client}>
      <CollectionSelectorModal />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByRole('button', { name: '新建收藏夹' }));
  await fireEvent.press(host.getByRole('button', { name: '返回收藏夹列表' }));
  expect(host.getByRole('button', { name: '完成选择收藏夹' })).toBeEnabled();
  await fireEvent.press(host.getByRole('button', { name: '完成选择收藏夹' }));
  expect(host.queryByTestId('collection-editor')).toBeNull();
  await host.unmount();
  client.clear();
});

test('guest collections show login guidance without making authenticated requests', async () => {
  mockCookies = null;
  const client = createClient();
  const host = await render(
    <QueryClientProvider client={client}>
      <MyCollectionsScreen />
    </QueryClientProvider>,
  );
  expect(host.getByText('登录后查看收藏夹，点此登录')).toBeTruthy();
  expect(getMyCollections).not.toHaveBeenCalled();
  expect(host.queryByText('刷新')).toBeNull();
  await host.unmount();
  client.clear();
});

test('editing a collection invalidates the exact cached detail with its route id', async () => {
  jest.mocked(updateCollection).mockResolvedValue({});
  const client = createClient();
  client.setQueryData(['collection-detail', '17'], {
    collection: { title: '旧名称' },
  });
  client.setQueryData(['collection-detail', '18'], {
    collection: { title: '保留' },
  });
  const host = await render(
    <QueryClientProvider client={client}>
      <MyCollectionsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(host.getByText('合成收藏夹')).toBeTruthy());
  await fireEvent(host.getByText('合成收藏夹'), 'longPress');
  await fireEvent.press(host.getByText('编辑收藏夹'));
  await fireEvent.press(host.getByText('保存收藏夹'));
  await waitFor(() =>
    expect(
      client.getQueryState(['collection-detail', '17'])?.isInvalidated,
    ).toBe(true),
  );
  expect(client.getQueryState(['collection-detail', '18'])?.isInvalidated).toBe(
    false,
  );
  await host.unmount();
  client.clear();
});

test('collection refresh requests only the first page and preserves question and video types', async () => {
  jest.mocked(getCollection).mockResolvedValue({
    collection: { id: 17, title: '合成收藏夹' },
    status: 0,
    message: '',
  });
  let finish: (page: Awaited<ReturnType<typeof getCollectionDetail>>) => void =
    () => {};
  jest.mocked(getCollectionDetail).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const refreshedPage = {
    data: [
      { content: { id: 'q', type: 'question' }, created: '' },
      { content: { id: 'v', type: 'zvideo' }, created: '' },
      { content: { id: 'lens', type: 'video' }, created: '' },
    ],
    paging: { is_end: true, next: '' },
  };
  const client = createClient();
  client.setQueryData(['collection-contents', '17'], {
    pages: [
      { data: [], paging: { is_end: false } },
      { data: [], paging: { is_end: true } },
    ],
    pageParams: [0, 20],
  });
  const host = await render(
    <QueryClientProvider client={client}>
      <CollectionDetailScreen />
    </QueryClientProvider>,
  );
  await fireEvent.press(host.getByText('刷新'));
  await waitFor(() =>
    expect(
      host.getByTestId('collection-list').props.accessibilityState.busy,
    ).toBe(true),
  );
  await act(() => finish(refreshedPage));
  await waitFor(() => expect(host.getByText('question:q')).toBeTruthy());
  expect(host.getByText('video:v')).toBeTruthy();
  expect(host.getByText('video:lens')).toBeTruthy();
  expect(mockVideoTypes.get('v')).toBe('zvideo');
  expect(mockVideoTypes.get('lens')).toBe('video');
  expect(
    host.getByTestId('collection-list').props.accessibilityState.busy,
  ).toBe(false);
  expect(getCollectionDetail).toHaveBeenCalledTimes(1);
  expect(getCollectionDetail).toHaveBeenCalledWith('17', 20, 0);
  await host.unmount();
  client.clear();
});

test('saving keeps the collection editor mounted and disables dismiss gestures', async () => {
  let finish: (response: Awaited<ReturnType<typeof updateCollection>>) => void =
    () => {};
  jest.mocked(updateCollection).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = createClient();
  const host = await render(
    <QueryClientProvider client={client}>
      <MyCollectionsScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(host.getByText('合成收藏夹')).toBeTruthy());
  await fireEvent(host.getByText('合成收藏夹'), 'longPress');
  await fireEvent.press(host.getByText('编辑收藏夹'));
  await fireEvent.press(host.getByText('保存收藏夹'));
  await waitFor(() =>
    expect(
      host.getByTestId('collection-editor').props.accessibilityState.busy,
    ).toBe(true),
  );
  await fireEvent.press(host.getByText('关闭收藏夹'));
  expect(host.getByText('保存收藏夹')).toBeTruthy();
  await act(() => finish({}));
  await waitFor(() =>
    expect(host.queryByTestId('collection-editor')).toBeNull(),
  );
  await host.unmount();
  client.clear();
});
