import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import type { ComponentProps, PropsWithChildren } from 'react';
import { Share } from 'react-native';
import { getAllContentCollectionStatus } from '../src/api/zhihu/collection';
import type { CollectionStarIcon } from '../src/components/CollectionStarIcon';
import { ShareMenu } from '../src/components/ShareMenu';
import { useContentActions } from '../src/hooks/useContentActions';
import { useCollectionStore } from '../src/store/useCollectionStore';
import { copyToClipboard } from '../src/utils/clipboard';
import type {
  ContentShareData,
  ContentShareType,
} from '../src/utils/contentActions';

let mockAuthenticated = true;
let mockCollectionPending = false;
let mockAuthSessionVersion = 0;
const mockToggleCollect = jest.fn();
const mockPush = jest.fn();
const mockRequestClose = jest.fn();
let mockFinishClose: (() => void) | undefined;
const mockCollectionStar = jest.fn(
  (_props: ComponentProps<typeof CollectionStarIcon>) => null,
);

jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));

jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookies: string | null) =>
    cookies === 'synthetic-authenticated',
}));
jest.mock('../src/api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../src/hooks/useCollectionAction', () => ({
  useCollectionAction: () => ({
    toggleCollect: mockToggleCollect,
  }),
  useCollectionActionPending: () => mockCollectionPending,
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockAuthSessionVersion,
  useAuthStore: (select: (state: { cookies: string }) => unknown) =>
    select({
      cookies: mockAuthenticated
        ? 'synthetic-authenticated'
        : 'synthetic-tracking-cookie',
    }),
}));
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/constants/Colors', () => ({
  __esModule: true,
  default: {
    light: {
      backgroundTertiary: '#ffffff',
      divider: '#dddddd',
      text: '#222222',
      danger: '#cc0000',
    },
  },
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/CollectionStarIcon', () => ({
  CollectionStarIcon: (props: ComponentProps<typeof CollectionStarIcon>) =>
    mockCollectionStar(props),
}));
jest.mock('../src/utils/haptics', () => ({
  ImpactFeedbackStyle: { Medium: 'medium' },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock('../src/utils/clipboard', () => ({ copyToClipboard: jest.fn() }));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/components/overlays/BottomSheet', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  interface MockSheetProps {
    visible: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
  }
  return {
    BottomSheet: react.forwardRef((props: MockSheetProps, ref) => {
      const latestClose = react.useRef(props.onClose);
      react.useEffect(() => {
        latestClose.current = props.onClose;
      }, [props.onClose]);
      react.useImperativeHandle(ref, () => ({
        close: () => {
          mockRequestClose();
          // Native BottomSheet reads its latest onClose ref after animation.
          mockFinishClose = () => latestClose.current();
        },
      }));
      return props.visible
        ? react.createElement(
            native.View,
            null,
            react.createElement(native.Text, null, props.title),
            props.children,
          )
        : null;
    }),
  };
});

const share = jest.spyOn(Share, 'share');
const clients: QueryClient[] = [];
type MenuProps = ComponentProps<typeof ShareMenu>;
const knownData: ContentShareData = {
  id: '42',
  title: '合成问题标题',
  author: '合成作者',
  isCollected: false,
};

async function setup(overrides: Partial<MenuProps> = {}) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  clients.push(client);
  const onClose = jest.fn();
  let props: MenuProps = {
    visible: true,
    onClose,
    type: 'answer',
    data: knownData,
    ...overrides,
  };
  const tree = () => (
    <QueryClientProvider client={client}>
      <ShareMenu {...props} />
    </QueryClientProvider>
  );
  const host = await render(tree());
  return {
    ...host,
    client,
    onClose,
    update: async (next: Partial<MenuProps>) => {
      props = { ...props, ...next };
      await host.rerender(tree());
    },
  };
}

async function finishClose() {
  expect(mockFinishClose).toBeDefined();
  const finish = mockFinishClose;
  mockFinishClose = undefined;
  await act(() => finish?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticated = true;
  mockCollectionPending = false;
  mockAuthSessionVersion = 0;
  mockFinishClose = undefined;
  useCollectionStore.getState().resetSession();
  jest.mocked(getAllContentCollectionStatus).mockResolvedValue({ data: [] });
  jest.mocked(copyToClipboard).mockResolvedValue(true);
  share.mockResolvedValue({
    action: Share.sharedAction,
    activityType: undefined,
  });
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

test('exposes every content format and author action directly in one menu', async () => {
  const edit = jest.fn();
  const remove = jest.fn();
  const host = await setup({
    additionalOptions: [
      { key: 'edit', icon: 'create-outline', label: '编辑回答', onPress: edit },
      {
        key: 'delete',
        icon: 'trash-outline',
        label: '删除回答',
        destructive: true,
        onPress: remove,
      },
    ],
  });
  for (const label of [
    '收藏',
    '导出回答…',
    '系统分享链接',
    '分享标题与链接',
    '复制链接',
    '复制信息（Markdown）',
    '编辑回答',
    '删除回答',
  ]) {
    expect(host.getByRole('button', { name: label })).toBeTruthy();
  }
  expect(host.queryByRole('button', { name: '分享回答' })).toBeNull();
  await fireEvent.press(host.getByRole('button', { name: '编辑回答' }));
  expect(edit).not.toHaveBeenCalled();
  await finishClose();
  expect(edit).toHaveBeenCalledTimes(1);
  expect(remove).not.toHaveBeenCalled();
});

test('opens an export bound to the selected content and session after closing', async () => {
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '导出回答…' }));
  expect(mockPush).not.toHaveBeenCalled();
  await finishClose();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/export-content',
    params: { type: 'answer', id: '42', session: '0' },
  });
});

test('question export names its scope and video menus omit unsupported export', async () => {
  const host = await setup({ type: 'question' });
  expect(host.getByRole('button', { name: '导出问题描述…' })).toBeTruthy();
  await host.update({ type: 'video' });
  expect(host.queryByRole('button', { name: /导出/ })).toBeNull();
});

test('an account change cancels queued export navigation', async () => {
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '导出回答…' }));
  mockAuthSessionVersion += 1;
  await finishClose();
  expect(mockPush).not.toHaveBeenCalled();
});

test.each([
  'answer',
  'article',
  'question',
  'pin',
  'video',
  'daily',
] satisfies ContentShareType[])(
  'shows collection only for supported content type %s',
  async (type) => {
    const host = await setup({ type });
    const collection = host.queryByRole('button', { name: '收藏' });
    if (type === 'answer' || type === 'article') {
      expect(collection).toBeTruthy();
    } else {
      expect(collection).toBeNull();
    }
    expect(host.getByRole('button', { name: '复制链接' })).toBeTruthy();
  },
);

test('honors server-known fallback, newer store state and pending mutation', async () => {
  const host = await setup({ data: { ...knownData, isCollected: true } });
  expect(host.getByRole('button', { name: '取消收藏' })).toBeTruthy();
  expect(mockCollectionStar).toHaveBeenLastCalledWith(
    expect.objectContaining({ filled: true }),
  );
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  await act(() =>
    useCollectionStore.getState().setCollectedStatus('42', false),
  );
  const collect = host.getByRole('button', { name: '收藏' });
  expect(mockCollectionStar).toHaveBeenLastCalledWith(
    expect.objectContaining({ filled: false }),
  );
  mockCollectionPending = true;
  await host.update({});
  expect(host.getByRole('button', { name: '收藏' })).toBeDisabled();
  await fireEvent.press(collect);
  expect(mockToggleCollect).not.toHaveBeenCalled();
  expect(mockRequestClose).not.toHaveBeenCalled();
  mockCollectionPending = false;
  await host.update({});
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  expect(mockToggleCollect).not.toHaveBeenCalled();
  await finishClose();
  expect(mockToggleCollect).toHaveBeenCalledWith('42', 'answer', false);
});

test('loads an unknown authenticated state before offering the correct removal action', async () => {
  let resolve: (
    value: Awaited<ReturnType<typeof getAllContentCollectionStatus>>,
  ) => void = () => {};
  jest.mocked(getAllContentCollectionStatus).mockImplementationOnce(
    () =>
      new Promise((finish) => {
        resolve = finish;
      }),
  );
  const host = await setup({ data: { id: '42', title: '合成问题标题' } });
  expect(
    host.getByRole('button', { name: '正在读取收藏状态…' }),
  ).toBeDisabled();
  await waitFor(() =>
    expect(getAllContentCollectionStatus).toHaveBeenCalledWith('42', 'answer'),
  );
  await act(() =>
    resolve({
      data: [
        {
          id: '7',
          title: '合成收藏夹',
          is_public: false,
          is_favorited: true,
        },
      ],
    }),
  );
  await waitFor(() =>
    expect(host.getByRole('button', { name: '取消收藏' })).toBeEnabled(),
  );
  await fireEvent.press(host.getByRole('button', { name: '取消收藏' }));
  await finishClose();
  expect(mockToggleCollect).toHaveBeenCalledWith('42', 'answer', true);
});

test('offers a usable retry after an unknown-state lookup fails', async () => {
  jest
    .mocked(getAllContentCollectionStatus)
    .mockRejectedValueOnce(new Error('synthetic status failure'))
    .mockResolvedValueOnce({ data: [] });
  const host = await setup({ data: { id: '42' } });
  await waitFor(() =>
    expect(
      host.getByRole('button', { name: '重试获取收藏状态' }),
    ).toBeEnabled(),
  );
  await fireEvent.press(host.getByRole('button', { name: '重试获取收藏状态' }));
  expect(getAllContentCollectionStatus).toHaveBeenCalledTimes(1);
  await finishClose();
  await waitFor(() =>
    expect(host.getByRole('button', { name: '收藏' })).toBeEnabled(),
  );
  expect(getAllContentCollectionStatus).toHaveBeenCalledTimes(2);
  expect(mockToggleCollect).not.toHaveBeenCalled();
});

test('guests can request login through collection without attempting status lookup', async () => {
  mockAuthenticated = false;
  const host = await setup({ data: { id: '42' } });
  expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  await finishClose();
  expect(mockToggleCollect).toHaveBeenCalledWith('42', 'answer', false);
});

test('system sharing executes once after the close animation completes', async () => {
  const host = await setup();
  const button = host.getByRole('button', { name: '系统分享链接' });
  await fireEvent.press(button);
  await fireEvent.press(button);
  expect(share).not.toHaveBeenCalled();
  expect(mockRequestClose).toHaveBeenCalledTimes(1);
  await finishClose();
  expect(host.onClose).toHaveBeenCalledTimes(1);
  expect(share).toHaveBeenCalledTimes(1);
});

test.each(['复制链接', '复制信息（Markdown）'])(
  '%s executes only after closing and uses the selected content',
  async (label) => {
    const host = await setup();
    await fireEvent.press(host.getByRole('button', { name: label }));
    expect(copyToClipboard).not.toHaveBeenCalled();
    await finishClose();
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    if (label === '复制链接') {
      expect(copyToClipboard).toHaveBeenCalledWith(
        'https://www.zhihu.com/answer/42',
      );
    } else {
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('**合成作者**'),
      );
      expect(copyToClipboard).toHaveBeenCalledWith(
        expect.stringContaining('https://www.zhihu.com/answer/42'),
      );
    }
  },
);

test('changing content identity discards a queued copy without closing the new content menu', async () => {
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '复制链接' }));
  await host.update({ data: { ...knownData, id: '99' } });
  await finishClose();
  expect(copyToClipboard).not.toHaveBeenCalled();
  expect(host.onClose).not.toHaveBeenCalled();
  expect(host.getByRole('button', { name: '复制链接' })).toBeEnabled();
});

test('an account switch discards queued collection without acting on the new account', async () => {
  const host = await setup({ data: { ...knownData, isCollected: true } });
  await fireEvent.press(host.getByRole('button', { name: '取消收藏' }));
  mockAuthSessionVersion += 1;
  await host.update({ data: knownData });
  await finishClose();
  expect(mockToggleCollect).not.toHaveBeenCalled();
  expect(host.onClose).not.toHaveBeenCalled();
  expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
});

test('an old collection callback rejects a changed session even before the menu rerenders', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  const host = await renderHook(
    () => useContentActions({ type: 'answer', data: knownData }),
    {
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  const collect = host.result.current.actions.find(
    (action) => action.key === 'collection',
  );
  expect(collect?.onPress).toBeDefined();
  await act(() => {
    mockAuthSessionVersion += 1;
    collect?.onPress();
  });
  expect(mockToggleCollect).not.toHaveBeenCalled();
});
