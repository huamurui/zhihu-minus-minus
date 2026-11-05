import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps } from 'react';
import type { PressableProps } from 'react-native';
import { getAllContentCollectionStatus } from '../src/api/zhihu/collection';
import { CollectionButton } from '../src/components/CollectionButton';
import { useCollectionStore } from '../src/store/useCollectionStore';
import { showToast } from '../src/utils/toast';

let mockAuthenticated = true;
let mockPending = false;
let mockSessionVersion = 0;
const mockToggleCollect = jest.fn();
let mockOnPress: PressableProps['onPress'];

jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookies: string) =>
    cookies === 'synthetic-authenticated',
}));
jest.mock('../src/api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../src/hooks/useCollectionAction', () => ({
  useCollectionAction: () => ({
    toggleCollect: mockToggleCollect,
    isPending: mockPending,
  }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: string }) => unknown) =>
    selector({
      cookies: mockAuthenticated
        ? 'synthetic-authenticated'
        : 'synthetic-tracking',
    }),
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual<typeof import('react-native')>('react-native').Text,
  useThemeColor: () => '#1364cc',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: (props: PressableProps) => {
    mockOnPress = props.onPress;
    return jest
      .requireActual<typeof import('react')>('react')
      .createElement(
        jest.requireActual<typeof import('react-native')>('react-native')
          .Pressable,
        props,
      );
  },
}));
jest.mock('../src/components/CollectionStarIcon', () => ({
  CollectionStarIcon: () => null,
}));
jest.mock('../src/utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../src/utils/zhihuError', () => ({
  getZhihuErrorMessage: () => '合成读取失败',
}));

type Props = ComponentProps<typeof CollectionButton>;
type Status = Awaited<ReturnType<typeof getAllContentCollectionStatus>>;
const clients: QueryClient[] = [];

function status(isFavorited: boolean): Status {
  return {
    data: [{ id: 'folder', title: '合成收藏夹', is_favorited: isFavorited }],
    paging: { is_end: true, is_start: true, next: '', previous: '' },
  };
}

function deferStatus() {
  let resolve: (value: Status) => void = () => {};
  const promise = new Promise<Status>((finish) => {
    resolve = finish;
  });
  jest.mocked(getAllContentCollectionStatus).mockReturnValueOnce(promise);
  return resolve;
}

async function setup(overrides: Partial<Props> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  let props: Props = { id: 'answer-a', type: 'answer', ...overrides };
  const tree = () => (
    <QueryClientProvider client={client}>
      <CollectionButton {...props} />
    </QueryClientProvider>
  );
  const host = await render(tree());
  return {
    ...host,
    client,
    update: async (next: Partial<Props>) => {
      props = { ...props, ...next };
      await host.rerender(tree());
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticated = true;
  mockPending = false;
  mockSessionVersion = 0;
  useCollectionStore.getState().resetSession();
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
});

test.each([false, true])(
  'known collection state %s toggles directly and stops card navigation',
  async (isCollected) => {
    const host = await setup({
      id: 42,
      type: 'article',
      isCollected,
      count: 123,
    });
    expect(host.getByText('123')).toBeTruthy();
    const stopPropagation = jest.fn();
    await fireEvent.press(
      host.getByRole('button', { name: isCollected ? '取消收藏' : '收藏' }),
      { stopPropagation },
    );
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(mockToggleCollect).toHaveBeenCalledWith(42, 'article', isCollected);
    expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  },
);

test.each([
  { count: 0, visible: '0', accessible: '0 次收藏' },
  { count: 12345, visible: '1.2万', accessible: '12345 次收藏' },
  { count: 20000, visible: '2万', accessible: '20000 次收藏' },
])(
  'displays the supplied collection count $count and preserves its full accessible value',
  async ({ count, visible, accessible }) => {
    const host = await setup({ count, isCollected: false });
    expect(host.getByText(visible)).toBeTruthy();
    expect(host.getByRole('button', { name: '收藏' })).toHaveProp(
      'accessibilityValue',
      { text: accessible },
    );
    expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  },
);

test.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
  'does not invent a visible or accessible quantity for invalid count %s',
  async (count) => {
    const host = await setup({ count, isCollected: false });
    expect(host.queryByText(/.*/)).toBeNull();
    expect(
      host.getByRole('button', { name: '收藏' }).props.accessibilityValue?.text,
    ).toBeUndefined();
  },
);

test('fresh server counts replace previous quantities without reapplying local collection offsets', async () => {
  useCollectionStore.getState().updateCollectedCountOffset('answer-a', 1);
  const host = await setup({ count: 20, isCollected: false });
  expect(host.getByText('20')).toBeTruthy();
  await act(() => {
    useCollectionStore.getState().setCollectedStatus('answer-a', true);
    useCollectionStore.getState().updateCollectedCountOffset('answer-a', 1);
  });
  await host.update({ count: 21, isCollected: true });
  expect(host.getByText('21')).toBeTruthy();
  expect(host.queryByText('22')).toBeNull();
  expect(host.queryByText('23')).toBeNull();
  expect(host.getByRole('button', { name: '取消收藏' })).toHaveProp(
    'accessibilityValue',
    { text: '21 次收藏' },
  );
});

test('compact collection keeps its complete accessible count while hiding only the visible number', async () => {
  const host = await setup({ count: 12345, isCollected: true, compact: true });
  expect(host.queryByText('1.2万')).toBeNull();
  const button = host.getByRole('button', { name: '取消收藏' });
  expect(button).toHaveProp('accessibilityValue', { text: '12345 次收藏' });
  await fireEvent.press(button);
  expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', true);
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
});

test('corner collection count stays visible and exposes the full value', async () => {
  const host = await setup({
    count: 12345,
    isCollected: true,
    countDisplay: 'corner',
  });
  expect(host.getByText('1.2万')).toBeTruthy();
  const button = host.getByRole('button', { name: '取消收藏' });
  expect(button).toHaveProp('accessibilityValue', { text: '12345 次收藏' });
  await fireEvent.press(button);
  expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', true);
});

test('unknown state loads only after a press, blocks duplicate presses and then toggles the resolved state', async () => {
  const resolve = deferStatus();
  const host = await setup();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  const loading = host.getByRole('button', { name: '正在读取收藏状态…' });
  expect(loading).toBeDisabled();
  await fireEvent.press(loading);
  expect(getAllContentCollectionStatus).toHaveBeenCalledTimes(1);
  expect(getAllContentCollectionStatus).toHaveBeenCalledWith(
    'answer-a',
    'answer',
  );
  await act(() => resolve(status(true)));
  await waitFor(() =>
    expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', true),
  );
  expect(
    host.client.getQueryData(['answer-collection-status', 'answer-a']),
  ).toEqual(status(true));
  expect(host.getByRole('button', { name: '取消收藏' })).toBeEnabled();
});

test('a guest uses the existing login action without fetching collection state', async () => {
  mockAuthenticated = false;
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', false);
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
});

test('global collection updates override server state and pending mutations disable the control', async () => {
  const host = await setup({ isCollected: false });
  await act(() =>
    useCollectionStore.getState().setCollectedStatus('answer-a', true),
  );
  expect(host.getByRole('button', { name: '取消收藏' })).toBeTruthy();
  await fireEvent.press(host.getByRole('button', { name: '取消收藏' }));
  expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', true);
  mockPending = true;
  await host.update({});
  expect(host.getByRole('button', { name: '取消收藏' })).toBeDisabled();
  await fireEvent.press(host.getByRole('button', { name: '取消收藏' }));
  expect(mockToggleCollect).toHaveBeenCalledTimes(1);
  mockPending = false;
  await host.update({});
  await act(() =>
    useCollectionStore.getState().setCollectedStatus('answer-a', false),
  );
  expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
});

test('a fresh shared state wins over a collection lookup already in flight', async () => {
  const resolve = deferStatus();
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  await act(() =>
    useCollectionStore.getState().setCollectedStatus('answer-a', true),
  );
  await act(() => resolve(status(false)));
  await waitFor(() =>
    expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', true),
  );
});

test('lookup failures leave the action available for retry', async () => {
  jest
    .mocked(getAllContentCollectionStatus)
    .mockRejectedValueOnce(new Error('synthetic failure'));
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  await waitFor(() => expect(showToast).toHaveBeenCalledWith('合成读取失败'));
  expect(mockToggleCollect).not.toHaveBeenCalled();
  expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
  jest
    .mocked(getAllContentCollectionStatus)
    .mockResolvedValueOnce(status(false));
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  await waitFor(() =>
    expect(mockToggleCollect).toHaveBeenCalledWith('answer-a', 'answer', false),
  );
});

test.each([false, true])(
  'a recycled card ignores an old lookup even when returning to the same item: %s',
  async (returnToOriginal) => {
    const resolve = deferStatus();
    const host = await setup();
    await fireEvent.press(host.getByRole('button', { name: '收藏' }));
    await host.update({ id: 'answer-b', isCollected: false });
    if (returnToOriginal)
      await host.update({ id: 'answer-a', isCollected: false });
    expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
    await act(() => resolve(status(true)));
    expect(mockToggleCollect).not.toHaveBeenCalled();
    expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
    await fireEvent.press(host.getByRole('button', { name: '收藏' }));
    expect(mockToggleCollect).toHaveBeenCalledWith(
      returnToOriginal ? 'answer-a' : 'answer-b',
      'answer',
      false,
    );
  },
);

test('a late lookup cannot toggle or repopulate collection state after account switching', async () => {
  const resolve = deferStatus();
  const host = await setup();
  await fireEvent.press(host.getByRole('button', { name: '收藏' }));
  mockSessionVersion += 1;
  await act(() => resolve(status(true)));
  expect(mockToggleCollect).not.toHaveBeenCalled();
  expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  expect(showToast).not.toHaveBeenCalled();
});

test.each(['disabled', 'unmounted'] as const)(
  'a lookup does not apply after the button becomes %s',
  async (change) => {
    const resolve = deferStatus();
    const host = await setup();
    await fireEvent.press(host.getByRole('button', { name: '收藏' }));
    if (change === 'disabled') await host.update({ disabled: true });
    else await host.unmount();
    await act(() => resolve(status(true)));
    expect(mockToggleCollect).not.toHaveBeenCalled();
    expect(useCollectionStore.getState().collectedStatusMap).toEqual({});
  },
);

test('synchronous duplicate presses schedule only one known-state mutation', async () => {
  await setup({ isCollected: false });
  const press = mockOnPress;
  expect(press).toBeDefined();
  const event = { stopPropagation: jest.fn() } as unknown as Parameters<
    NonNullable<PressableProps['onPress']>
  >[0];
  await act(() => {
    press?.(event);
    press?.(event);
  });
  expect(mockToggleCollect).toHaveBeenCalledTimes(1);
});
