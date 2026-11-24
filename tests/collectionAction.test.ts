import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { createElement, type PropsWithChildren } from 'react';
import {
  fastCollectAnswer,
  getAllContentCollectionStatus,
  removeFromCollection,
} from '../src/api/zhihu/collection';
import { useCollectionAction } from '../src/hooks/useCollectionAction';
import { useContentActions } from '../src/hooks/useContentActions';
import { useCollectionStore } from '../src/store/useCollectionStore';
import { updateContentInteractionCaches } from '../src/utils/contentCache';

jest.mock('../src/api/zhihu/collection', () => ({
  fastCollectAnswer: jest.fn(),
  fastCollectArticle: jest.fn(),
  getAllContentCollectionStatus: jest.fn(),
  removeFromCollection: jest.fn(),
  removeArticleFromCollection: jest.fn(),
}));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null | undefined) =>
    typeof cookie === 'string' && /(?:^|;\s*)z_c0=[^;\s]+/.test(cookie),
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('../src/utils/contentCache', () => ({
  updateContentInteractionCaches: jest.fn(),
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/components/Themed', () => ({ useThemeColor: () => '#222' }));
jest.mock('../src/utils/clipboard', () => ({ copyToClipboard: jest.fn() }));
let mockSessionVersion = 0;
let mockCookies = 'z_c0=synthetic-session';
const mockPush = jest.fn();
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: Object.assign(
    (select: (state: { cookies: string }) => unknown) =>
      select({ cookies: mockCookies }),
    { getState: () => ({ cookies: mockCookies }) },
  ),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 0;
  mockCookies = 'z_c0=synthetic-session';
  useCollectionStore.getState().resetSession();
});

async function setup() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  const host = await renderHook(() => useCollectionAction(), {
    wrapper: ({ children }: PropsWithChildren) =>
      createElement(QueryClientProvider, { client }, children),
  });
  return { client, host };
}

test('tracking cookies alone send collection actions to login', async () => {
  mockCookies = 'd_c0=synthetic-tracking';
  const { client, host } = await setup();
  await act(() => host.result.current.toggleCollect('42', 'answer', false));
  expect(mockPush).toHaveBeenCalledWith('/login');
  expect(fastCollectAnswer).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('collection checks the latest login state at execution', async () => {
  const { client, host } = await setup();
  const outgoingAction = host.result.current.toggleCollect;
  mockCookies = '';
  await act(() => outgoingAction('42', 'answer', false));
  expect(mockPush).toHaveBeenCalledWith('/login');
  expect(fastCollectAnswer).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('late quick collection completion cannot repopulate a new session', async () => {
  let finish: (value: Awaited<ReturnType<typeof fastCollectAnswer>>) => void =
    () => {};
  jest.mocked(fastCollectAnswer).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  await act(() => host.result.current.collect('original', 'answer'));
  await act(() => {
    mockSessionVersion += 1;
    client.clear();
    useCollectionStore.getState().resetSession();
    finish({ collection: { id: 'folder', title: '合成收藏夹' } });
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  expect(useCollectionStore.getState().collectedCountOffsetMap).toEqual({});
  expect(updateContentInteractionCaches).not.toHaveBeenCalled();
  await host.unmount();
  client.clear();
});

test('quick overlapping successes only add one collected count', async () => {
  jest.mocked(fastCollectAnswer).mockResolvedValue({
    collection: { id: 'folder', title: '合成收藏夹' },
  });
  const { client, host } = await setup();
  await act(() => {
    host.result.current.collect('original', 'answer');
    host.result.current.collect('original', 'answer');
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(useCollectionStore.getState().collectedCountOffsetMap.original).toBe(
    1,
  );
  await host.unmount();
  client.clear();
});

test('reopening a menu while collection is pending prevents another request for that item', async () => {
  let finish!: (value: Awaited<ReturnType<typeof fastCollectAnswer>>) => void;
  jest.mocked(fastCollectAnswer).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host: button } = await setup();
  const mountMenu = (type: 'answer' | 'article', id: string | number) =>
    renderHook(
      () => {
        const { actions } = useContentActions({
          type,
          data: { id, isCollected: false },
        });
        const option = actions.find((action) => action.key === 'collection');
        if (!option) throw new Error('Expected a collection action');
        return option;
      },
      {
        wrapper: ({ children }: PropsWithChildren) =>
          createElement(QueryClientProvider, { client }, children),
      },
    );
  const first = await mountMenu('answer', 42);
  const collect = first.result.current.onPress;
  await first.unmount();
  await act(() => {
    collect();
    button.result.current.toggleCollect('42', 'answer', false);
  });
  const reopened = await mountMenu('answer', '42');
  expect(reopened.result.current.disabled).toBe(true);
  await act(() => {
    reopened.result.current.onPress();
  });
  expect(fastCollectAnswer).toHaveBeenCalledTimes(1);

  const otherItem = await mountMenu('answer', 43);
  const otherType = await mountMenu('article', 42);
  expect(otherItem.result.current.disabled).toBe(false);
  expect(otherType.result.current.disabled).toBe(false);
  await act(() =>
    finish({ collection: { id: 'folder', title: '合成收藏夹' } }),
  );
  await waitFor(() => expect(reopened.result.current.disabled).toBe(false));
  expect(reopened.result.current.label).toBe('取消收藏');
  expect(useCollectionStore.getState().collectedCountOffsetMap['42']).toBe(1);
  await reopened.unmount();
  await otherItem.unmount();
  await otherType.unmount();
  await button.unmount();
  client.clear();
});

test('a session switch during folder lookup prevents removal using the new account', async () => {
  let finish: (
    value: Awaited<ReturnType<typeof getAllContentCollectionStatus>>,
  ) => void = () => {};
  jest.mocked(getAllContentCollectionStatus).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { client, host } = await setup();
  await act(() => host.result.current.uncollect('original', 'answer'));
  await act(() => {
    mockSessionVersion += 1;
    useCollectionStore.getState().resetSession();
    finish({
      data: [
        {
          id: 'folder',
          title: '合成收藏夹',
          is_public: true,
          is_favorited: true,
        },
      ],
    });
  });
  await waitFor(() => expect(host.result.current.isPending).toBe(false));
  expect(removeFromCollection).not.toHaveBeenCalled();
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  await host.unmount();
  client.clear();
});
