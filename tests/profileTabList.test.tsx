import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef, type ReactNode } from 'react';
import { type MeasureOnSuccessCallback, Text } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  type ProfileListQuery,
  ProfileTabList,
  type ProfileTabListHandle,
  type ProfileTabListProps,
} from '../src/components/profile/ProfileTabList';

interface MockListProps {
  innerViewRef: {
    current: { measure: (callback: MeasureOnSuccessCallback) => void } | null;
  };
  data: unknown[];
  renderItem: (info: { item: unknown }) => ReactNode;
  keyExtractor: (item: unknown) => string;
  onScroll: {
    onScroll: (event: { contentOffset: { y: number } }) => void;
    onBeginDrag: () => void;
  };
  onLoad: () => void;
  onContentSizeChange: (width: number, height: number) => void;
  onEndReached: () => void;
  onRefresh: () => void;
  refreshing: boolean;
  contentContainerStyle: {
    paddingTop: number;
    paddingBottom: number;
    minHeight: number;
  };
  ListHeaderComponent?: ReactNode;
  ListEmptyComponent?: ReactNode;
  ListFooterComponent?: ReactNode;
}

let mockListProps: MockListProps;
const mockScrollToOffset = jest.fn();
const mockMeasureContent = jest.fn<void, [MeasureOnSuccessCallback]>();

jest.mock('@shopify/flash-list', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: react.forwardRef((props: MockListProps, ref) => {
      mockListProps = props;
      react.useImperativeHandle(ref, () => ({
        scrollToOffset: mockScrollToOffset,
        // A list far from its end: follow-up page loads stay out of these tests.
        getAbsoluteLastScrollOffset: () => 0,
        getWindowSize: () => ({ width: 400, height: 800 }),
        getChildContainerDimensions: () => ({ width: 400, height: 100_000 }),
        getFirstItemOffset: () => 0,
      }));
      react.useImperativeHandle(props.innerViewRef, () => ({
        measure: mockMeasureContent,
      }));
      return react.createElement(
        native.View,
        null,
        props.ListHeaderComponent,
        props.data.length > 0
          ? props.data.map((item) =>
              react.createElement(
                react.Fragment,
                { key: props.keyExtractor(item) },
                props.renderItem({ item }),
              ),
            )
          : props.ListEmptyComponent,
        props.ListFooterComponent,
      );
    }),
  };
});

jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { createAnimatedComponent: (component: unknown) => component },
    useSharedValue: (value: unknown) => react.useRef({ value }).current,
    useAnimatedScrollHandler: (handlers: unknown) => handlers,
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  };
});

jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});

jest.mock('../src/components/QueryErrorView', () => ({
  QueryErrorView: ({
    message,
    onRetry,
  }: {
    message: string;
    onRetry: () => void;
  }) => {
    const react = jest.requireActual<typeof import('react')>('react');
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    return react.createElement(
      native.Pressable,
      { onPress: onRetry },
      react.createElement(native.Text, null, message),
    );
  },
}));

function createOffsets(value = [0, 0]): SharedValue<number[]> {
  return {
    value,
    get() {
      return this.value;
    },
    set(next) {
      this.value = typeof next === 'function' ? next(this.value) : next;
    },
    addListener: jest.fn(),
    removeListener: jest.fn(),
    modify(modifier) {
      if (modifier) this.value = modifier(this.value);
    },
  };
}

function createQuery(overrides: Partial<ProfileListQuery> = {}) {
  return {
    data: [],
    isLoading: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    hasNextPage: true,
    refetch: jest.fn().mockResolvedValue(undefined),
    fetchNextPage: jest.fn().mockResolvedValue(undefined),
    refresh: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createProps(overrides: Partial<ProfileTabListProps> = {}) {
  return {
    index: 1,
    label: '创作',
    query: createQuery(),
    headerHeight: 420,
    collapseDistance: 320,
    viewportHeight: 720,
    bottomInset: 24,
    offsets: createOffsets(),
    active: true,
    renderItem: () => null,
    keyExtractor: (item: unknown) => String(item),
    ...overrides,
  };
}

async function readyList(contentHeight = 1600) {
  await act(() => {
    mockListProps.onLoad();
    mockListProps.onContentSizeChange(390, contentHeight);
  });
}

async function scrollNative(offset: number) {
  await act(() => {
    mockListProps.onScroll.onScroll({ contentOffset: { y: offset } });
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockMeasureContent.mockReset();
});

test('initial profile loading leaves the list empty until member details arrive', async () => {
  const props = createProps({
    query: createQuery({ isLoading: true }),
    hideInitialLoadingIndicator: true,
  });
  const host = await render(<ProfileTabList {...props} />);
  expect(mockListProps.ListEmptyComponent).toBeNull();
  await host.rerender(
    <ProfileTabList {...props} hideInitialLoadingIndicator={false} />,
  );
  expect(mockListProps.ListEmptyComponent).not.toBeNull();
});

test('cached cards wait for the first measured header before mounting', async () => {
  const props = createProps({
    headerHeight: 0,
    collapseDistance: 0,
    query: createQuery({ data: ['cached-card'] }),
    renderItem: () => <Text>已缓存的卡片</Text>,
  });
  const host = await render(<ProfileTabList {...props} />);
  expect(host.queryByText('已缓存的卡片')).toBeNull();
  await host.rerender(
    <ProfileTabList {...props} headerHeight={420} collapseDistance={320} />,
  );
  expect(host.getByText('已缓存的卡片')).toBeVisible();
  expect(mockListProps.contentContainerStyle.paddingTop).toBe(420);
});

test('restores an unmeasured tab after load without losing the request to initial native zero', async () => {
  const ref = createRef<ProfileTabListHandle>();
  const props = createProps();
  await render(<ProfileTabList {...props} ref={ref} />);
  await act(() => ref.current?.scrollToOffset(280));
  await scrollNative(0);
  expect(props.offsets.value[1]).toBe(0);
  expect(mockScrollToOffset).not.toHaveBeenCalled();

  await readyList();
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 280,
    animated: false,
  });
  await scrollNative(0);
  mockScrollToOffset.mockClear();
  await act(() => mockListProps.onContentSizeChange(390, 1700));
  expect(mockScrollToOffset).toHaveBeenCalledWith({
    offset: 280,
    animated: false,
  });

  await scrollNative(280);
  expect(props.offsets.value[1]).toBe(280);
  mockScrollToOffset.mockClear();
  await act(() => mockListProps.onContentSizeChange(390, 1800));
  expect(mockScrollToOffset).not.toHaveBeenCalled();
});

test('only records real intermediate native offsets during animated scrolling', async () => {
  const ref = createRef<ProfileTabListHandle>();
  const props = createProps();
  await render(<ProfileTabList {...props} ref={ref} />);
  await readyList();
  await scrollNative(600);
  await act(() => ref.current?.scrollToOffset(0, true));
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 0,
    animated: true,
  });
  expect(props.offsets.value[1]).toBe(600);
  await scrollNative(240);
  expect(props.offsets.value[1]).toBe(240);
  await scrollNative(0);
  expect(props.offsets.value[1]).toBe(0);
});

test('preserves deep content position when the measured header height changes', async () => {
  const props = createProps();
  const host = await render(<ProfileTabList {...props} />);
  await readyList(2000);
  await scrollNative(820);
  await host.rerender(
    <ProfileTabList {...props} headerHeight={580} collapseDistance={480} />,
  );
  // A request using the old native content size could clamp too early.
  expect(mockScrollToOffset).not.toHaveBeenCalled();
  await act(() => mockListProps.onContentSizeChange(390, 2160));
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 980,
    animated: false,
  });
  expect(props.offsets.value[1]).toBe(820);
  await scrollNative(980);
  expect(props.offsets.value[1]).toBe(980);
});

test('resizes a pending request rather than a stale initial native offset', async () => {
  const ref = createRef<ProfileTabListHandle>();
  const props = createProps();
  const host = await render(<ProfileTabList {...props} ref={ref} />);
  await act(() => ref.current?.scrollToOffset(160));
  await scrollNative(0);
  await host.rerender(
    <ProfileTabList
      {...props}
      ref={ref}
      headerHeight={580}
      collapseDistance={480}
    />,
  );
  await readyList(2160);
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 240,
    animated: false,
  });
});

test('restores after geometry changes even when native content height stays unchanged', async () => {
  const props = createProps();
  const host = await render(<ProfileTabList {...props} />);
  await readyList(1040);
  await scrollNative(160);
  mockMeasureContent.mockImplementation((complete) => {
    complete(0, 0, 390, 1040, 0, 0);
  });

  // A larger header and a shorter viewport keep this short list at 1040px.
  // RN therefore has no content-size change event to send after this commit.
  await host.rerender(
    <ProfileTabList
      {...props}
      headerHeight={460}
      collapseDistance={360}
      viewportHeight={680}
    />,
  );
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 180,
    animated: false,
  });
  expect(props.offsets.value[1]).toBe(160);
  await scrollNative(180);
  expect(props.offsets.value[1]).toBe(180);
});

test('the first header measurement preserves an unloaded absolute scroll request', async () => {
  const ref = createRef<ProfileTabListHandle>();
  const props = createProps({ headerHeight: 0, collapseDistance: 0 });
  const host = await render(<ProfileTabList {...props} ref={ref} />);
  await act(() => ref.current?.scrollToOffset(160));
  await host.rerender(
    <ProfileTabList
      {...props}
      ref={ref}
      headerHeight={420}
      collapseDistance={320}
    />,
  );
  await scrollNative(0);
  await readyList();
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 160,
    animated: false,
  });
});

test('ignores a native content measurement from an obsolete header geometry', async () => {
  const props = createProps();
  const host = await render(<ProfileTabList {...props} />);
  await readyList(2000);
  await scrollNative(820);
  const callbacks: MeasureOnSuccessCallback[] = [];
  mockMeasureContent.mockImplementation((complete) => {
    callbacks.push(complete);
  });
  await host.rerender(
    <ProfileTabList {...props} headerHeight={580} collapseDistance={480} />,
  );
  await host.rerender(
    <ProfileTabList {...props} headerHeight={500} collapseDistance={400} />,
  );
  expect(callbacks).toHaveLength(2);
  await act(() => callbacks[0](0, 0, 390, 2160, 0, 0));
  expect(mockScrollToOffset).not.toHaveBeenCalled();
  await act(() => callbacks[1](0, 0, 390, 2080, 0, 0));
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 900,
    animated: false,
  });
});

test('allows an empty list to collapse and clamps requests to real available content', async () => {
  const ref = createRef<ProfileTabListHandle>();
  const props = createProps();
  await render(<ProfileTabList {...props} ref={ref} />);
  expect(mockListProps.contentContainerStyle).toEqual({
    paddingTop: 420,
    paddingBottom: 48,
    minHeight: 1040,
  });
  await readyList(1040);
  await act(() => ref.current?.scrollToOffset(320));
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 320,
    animated: false,
  });
  await scrollNative(320);
  await act(() => ref.current?.scrollToOffset(900));
  expect(mockScrollToOffset).toHaveBeenLastCalledWith({
    offset: 320,
    animated: false,
  });
});

test('new user dragging cancels a pending restore', async () => {
  const ref = createRef<ProfileTabListHandle>();
  await render(<ProfileTabList {...createProps()} ref={ref} />);
  await act(() => ref.current?.scrollToOffset(280));
  await act(() => mockListProps.onScroll.onBeginDrag());
  await readyList();
  expect(mockScrollToOffset).not.toHaveBeenCalled();
});

test('background pages and failed next pages cannot automatically fetch', async () => {
  const query = createQuery();
  const props = createProps({ active: false, query });
  const host = await render(<ProfileTabList {...props} />);
  await act(() => mockListProps.onEndReached());
  expect(query.fetchNextPage).not.toHaveBeenCalled();
  await host.rerender(
    <ProfileTabList
      {...props}
      active
      query={{ ...query, isFetchNextPageError: true }}
    />,
  );
  await act(() => mockListProps.onEndReached());
  expect(query.fetchNextPage).not.toHaveBeenCalled();
});

test('explicit next-page retry retains content and only submits once', async () => {
  let finish: () => void = () => {};
  const fetchNextPage = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const query = createQuery({
    data: ['one'],
    isFetchNextPageError: true,
    fetchNextPage,
  });
  const host = await render(<ProfileTabList {...createProps({ query })} />);
  await fireEvent.press(host.getByText('更多内容加载失败'));
  await fireEvent.press(host.getByText('更多内容加载失败'));
  expect(fetchNextPage).toHaveBeenCalledTimes(1);
  await act(() => finish());
});

test('refresh stays visible through query reset and blocks pagination until settled', async () => {
  let finish: () => void = () => {};
  const refresh = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const query = createQuery({ data: ['one'], refresh });
  const props = createProps({ query });
  const host = await render(<ProfileTabList {...props} />);
  await act(() => {
    mockListProps.onRefresh();
    mockListProps.onEndReached();
  });
  expect(query.fetchNextPage).not.toHaveBeenCalled();
  expect(mockListProps.refreshing).toBe(true);
  await host.rerender(
    <ProfileTabList
      {...props}
      query={{ ...query, data: [], isLoading: true }}
    />,
  );
  expect(mockListProps.refreshing).toBe(true);
  await act(() => finish());
  expect(mockListProps.refreshing).toBe(false);
});

test('custom empty state is shown only after loading and errors are handled', async () => {
  const props = createProps({
    emptyState: <Text>登录后查看我赞同过的回答</Text>,
  });
  const host = await render(<ProfileTabList {...props} />);
  expect(host.getByText('登录后查看我赞同过的回答')).toBeTruthy();
  expect(host.queryByText('暂无创作内容')).toBeNull();

  await host.rerender(
    <ProfileTabList {...props} query={createQuery({ isLoading: true })} />,
  );
  expect(host.queryByText('登录后查看我赞同过的回答')).toBeNull();
  await host.rerender(
    <ProfileTabList {...props} query={createQuery({ isError: true })} />,
  );
  expect(host.getByText('创作加载失败')).toBeTruthy();
  expect(host.queryByText('登录后查看我赞同过的回答')).toBeNull();

  await host.rerender(
    <ProfileTabList {...props} query={createQuery({ data: ['one'] })} />,
  );
  expect(host.queryByText('登录后查看我赞同过的回答')).toBeNull();
  await host.rerender(<ProfileTabList {...props} emptyState={undefined} />);
  expect(host.getByText('暂无创作内容')).toBeTruthy();
});
