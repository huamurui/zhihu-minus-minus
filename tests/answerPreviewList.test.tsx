import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';
import type {
  ZhihuPlainPreviewAnswer,
  ZhihuPreviewAnswer,
  ZhihuReadingPreviewItem,
} from '../src/api/zhihu/nextRender';
import type { AnswerEndorsements } from '../src/components/AnswerEndorsements';
import { AnswerPreviewList } from '../src/components/AnswerPreviewList';
import type { FeedCardActionRow } from '../src/components/FeedCardActionRow';
import type {
  CollapsibleRichContent,
  ZhihuContentProps,
  ZhihuStructuredContentProps,
} from '../src/features/rich-content';
import type { useAnswerPreviewAutoLoad } from '../src/hooks/useAnswerPreviewAutoLoad';
import type { useAnswerPreviewFloatingBar } from '../src/hooks/useAnswerPreviewFloatingBar';

let mockSessionVersion = 1;
let mockQuerySessionVersion: number | null = null;
let mockSelectedIsPending = false;
let mockActiveAnswerId: string | null = null;
let mockFollowingAnswers: Array<ZhihuPlainPreviewAnswer | ZhihuPreviewAnswer> =
  [];
type ViewabilityCallback = ReturnType<
  typeof useAnswerPreviewFloatingBar
>['onViewableItemsChanged'];
let mockViewabilityCallback: ViewabilityCallback | null = null;
/** List scroll offset; card starts sit 100px down, so 0 keeps them on screen. */
let mockScrollOffset = 0;
const mockReadTouch = jest.fn(
  (_answerIds: readonly string[], _enabled?: boolean) => {},
);
const mockPlainBodies = new Map<string, ZhihuContentProps>();
type CollapseProps = ComponentProps<typeof CollapsibleRichContent>;
const mockPlainCollapses = new Map<string, CollapseProps>();
const mockStructuredBodies = new Map<string, ZhihuStructuredContentProps>();
const mockRefetchSelected = jest.fn(() => Promise.resolve(undefined));
const mockScrollToIndex = jest.fn();
const mockRenderCardActions = jest.fn(
  (_props: ComponentProps<typeof FeedCardActionRow>) => null,
);
const mockRenderEndorsements = jest.fn(
  (_props: ComponentProps<typeof AnswerEndorsements>) => null,
);
const mockRenderFloatingBar = jest.fn(
  (_props: { canCollapse?: boolean; onCollapse: (id: string) => void }) => null,
);
const mockBodyHandlers = {
  autoLoadMore: jest.fn(() => Promise.resolve(undefined)),
  loadMore: jest.fn(() => Promise.resolve(undefined)),
  refresh: jest.fn(() => Promise.resolve(undefined)),
  onExpandedChange: jest.fn(),
};
const mockFloatingBar = jest.fn(
  (options: Parameters<typeof useAnswerPreviewFloatingBar>[0]) => ({
    activeAnswer:
      options.items.find(
        (item) =>
          item.type === 'answer' &&
          (mockActiveAnswerId === null || item.id === mockActiveAnswerId),
      ) ?? null,
    visible: false,
    viewabilityConfig: {},
    registerFooter: jest.fn(),
    onFooterLayout: jest.fn(),
    onViewableItemsChanged: jest.fn(),
    onScroll: jest.fn(),
    onScrollEnd: jest.fn(),
  }),
);
const mockAutoLoad = jest.fn(
  (_options: Parameters<typeof useAnswerPreviewAutoLoad>[0]) => ({
    registerFooter: jest.fn(),
    registerLoader: jest.fn(),
    onFooterLayout: jest.fn(),
    onViewableItemsChanged: jest.fn(),
    onScroll: jest.fn(),
    onScrollEnd: jest.fn(),
  }),
);

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 20, left: 0, right: 0 }),
}));
jest.mock('../src/api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: (
    selector: (state: { enableBrowseHistory: boolean }) => unknown,
  ) => selector({ enableBrowseHistory: false }),
}));
jest.mock('../src/hooks/useAnswerPreviewQuery', () => ({
  useAnswerPreviewQuery: ({ answerId }: { answerId: string }) => ({
    items: [mockPlainAnswer(answerId), ...mockFollowingAnswers],
    sessionVersion: mockQuerySessionVersion ?? mockSessionVersion,
    queryKey: ['answer-preview-list', answerId, mockSessionVersion],
    selectedIsPending: mockSelectedIsPending,
    selectedIsError: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetchSelected: mockRefetchSelected,
  }),
}));
jest.mock('../src/hooks/useAnswerReadTouch', () => ({
  useAnswerReadTouch: (answerIds: readonly string[], enabled?: boolean) =>
    mockReadTouch(answerIds, enabled),
}));
jest.mock('../src/hooks/useAnswerPreviewFloatingBar', () => ({
  useAnswerPreviewFloatingBar: (
    options: Parameters<typeof useAnswerPreviewFloatingBar>[0],
  ) => mockFloatingBar(options),
}));
jest.mock('../src/hooks/useAnswerPreviewAutoLoad', () => ({
  useAnswerPreviewAutoLoad: (
    options: Parameters<typeof useAnswerPreviewAutoLoad>[0],
  ) => mockAutoLoad(options),
}));
jest.mock('../src/hooks/useAnswerPreviewBody', () => ({
  useAnswerPreviewBody: ({
    initialContent,
  }: {
    initialContent: ZhihuPreviewAnswer['structuredContent'];
  }) => ({
    ...mockBodyHandlers,
    content: initialContent,
    hasMore: false,
    isLoadingMore: false,
  }),
}));
jest.mock('../src/hooks/useDetailHeaderState', () => ({
  useDetailHeaderState: () => ({
    collapsed: false,
    onScrollOffset: jest.fn(),
    onHeaderLayout: jest.fn(),
  }),
}));
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useRuntimeThemeColors: () => ({
      background: '#ffffff',
      backgroundSecondary: '#eeeeee',
      textSecondary: '#666666',
      link: '#123456',
    }),
  };
});
jest.mock('../src/components/ContentActionBar', () => ({
  CONTENT_ACTION_BAR_HEIGHT: 48,
  getContentActionBarBottom: (inset: number) => Math.max(inset, 12) + 20,
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../src/components/DetailNavigationHeader', () => ({
  DetailNavigationHeader: () => null,
  useDetailNavigationHeight: () => 56,
}));
jest.mock('../src/components/AnswerPreviewFloatingBar', () => ({
  AnswerPreviewFloatingBar: (props: {
    canCollapse?: boolean;
    onCollapse: (id: string) => void;
  }) => mockRenderFloatingBar(props),
}));
jest.mock('../src/components/AnswerPreviewQuestionHeader', () => ({
  AnswerPreviewQuestionHeader: () => null,
}));
jest.mock('../src/components/FeedCardActionRow', () => ({
  FeedCardActionRow: (props: ComponentProps<typeof FeedCardActionRow>) =>
    mockRenderCardActions(props),
}));
jest.mock('../src/components/AnswerEndorsements', () => ({
  AnswerEndorsements: (props: ComponentProps<typeof AnswerEndorsements>) =>
    mockRenderEndorsements(props),
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
}));
jest.mock('../src/components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../src/components/ShareMenu', () => ({ ShareMenu: () => null }));
jest.mock('../src/features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollapsibleRichContent: (props: CollapseProps) => {
      const id = props.contentKey.split(':').at(-1) ?? '';
      mockPlainCollapses.set(id, props);
      return react.createElement(
        native.View,
        null,
        props.children,
        props.footer,
        props.footerContent,
        react.createElement(
          native.Pressable,
          {
            testID: `plain-toggle:${id}`,
            accessibilityState: { expanded: props.expanded },
            onPress: () => props.onExpandedChange(!props.expanded),
          },
          react.createElement(
            native.Text,
            null,
            props.expanded ? '收起回答' : '展开回答',
          ),
        ),
      );
    },
    ZhihuContent: (props: ZhihuContentProps) => {
      mockPlainBodies.set(props.objectId ?? '', props);
      return react.createElement(
        native.Text,
        { testID: `plain-body:${props.objectId}` },
        props.content,
      );
    },
    ZhihuStructuredContent: (props: ZhihuStructuredContentProps) => {
      mockStructuredBodies.set(props.objectId ?? '', props);
      return react.createElement(
        native.View,
        null,
        props.footerContent,
        react.createElement(
          native.Pressable,
          {
            testID: `structured-toggle:${props.objectId}`,
            accessibilityState: { expanded: props.expanded },
            onPress: () => props.onExpandedChange?.(!props.expanded),
          },
          react.createElement(
            native.Text,
            null,
            props.expanded ? props.collapseLabel : props.expandLabel,
          ),
        ),
      );
    },
  };
});
jest.mock('@shopify/flash-list', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: react.forwardRef(
      (
        {
          data,
          renderItem,
          keyExtractor,
          refreshControl,
          onViewableItemsChanged,
        }: {
          data: ZhihuReadingPreviewItem[];
          renderItem: (info: {
            item: ZhihuReadingPreviewItem;
            index: number;
          }) => ReactNode;
          keyExtractor: (item: ZhihuReadingPreviewItem) => string;
          refreshControl: ReactNode;
          onViewableItemsChanged: ViewabilityCallback;
        },
        ref,
      ) => {
        mockViewabilityCallback = onViewableItemsChanged;
        react.useImperativeHandle(ref, () => ({
          scrollToIndex: mockScrollToIndex,
          scrollToOffset: jest.fn(),
          getLayout: () => ({ x: 0, y: 0, width: 400, height: 4000 }),
          getFirstItemOffset: () => 100,
          getAbsoluteLastScrollOffset: () => mockScrollOffset,
        }));
        return react.createElement(
          native.View,
          null,
          data.map((item, index) =>
            react.createElement(
              native.View,
              { key: keyExtractor(item) },
              renderItem({ item, index }),
            ),
          ),
          react.isValidElement<{ onRefresh?: () => void }>(refreshControl)
            ? react.createElement(native.Pressable, {
                testID: 'refresh-preview-list',
                onPress: refreshControl.props.onRefresh,
              })
            : null,
        );
      },
    ),
  };
});

function mockPlainAnswer(id: string): ZhihuPlainPreviewAnswer {
  return {
    id,
    type: 'answer',
    question: { id: 'synthetic-question', title: '合成问题' },
    author: {
      id: 'synthetic-author',
      name: '合成作者',
      url_token: 'synthetic-author',
      avatar_url: '',
      headline: '',
    },
    excerpt: '合成摘要',
    voteup_count: 0,
    comment_count: 0,
    favlists_count: 0,
    relationship: { is_author: false, is_favorited: false, voting: 0 },
    endorsements: [{ elements: [{ type: 'TEXT', content: `合成标签:${id}` }] }],
    publishInfo: {
      published: '发布于 2026-10-18',
      edited: '编辑于 2026-10-19',
      location: 'IP 属地天津',
    },
    content: '<p>第一段</p><p>第二段</p><p>第三段</p><p>完整第四段</p>',
  };
}

function structuredAnswer(id: string): ZhihuPreviewAnswer {
  return {
    ...mockPlainAnswer(id),
    structuredContent: {
      segments: [],
      paging: '',
    },
  };
}

function expectExpandedIds(ids: string[]) {
  const floatingOptions = mockFloatingBar.mock.calls.at(-1)?.[0];
  const autoLoadOptions = mockAutoLoad.mock.calls.at(-1)?.[0];
  if (!floatingOptions || !autoLoadOptions)
    throw new Error('Expected both viewport hooks to receive list state');
  expect(autoLoadOptions.scope).toBe(floatingOptions.scope);
  expect([...floatingOptions.expandedIds].sort()).toEqual([...ids].sort());
  expect([...autoLoadOptions.expandedIds].sort()).toEqual([...ids].sort());
}

function createHost(answerId = 'selected-answer') {
  const client = new QueryClient();
  const screen = (selectedId: string) => (
    <QueryClientProvider client={client}>
      <AnswerPreviewList answerId={selectedId} />
    </QueryClientProvider>
  );
  return { client, screen, element: screen(answerId) };
}

function viewabilityCallback(): ViewabilityCallback {
  if (!mockViewabilityCallback)
    throw new Error('Expected a list viewability callback');
  return mockViewabilityCallback;
}

function visibleAnswers(...ids: string[]) {
  return {
    viewableItems: ids.map((id) => ({
      item: mockPlainAnswer(id),
      isViewable: true,
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  mockQuerySessionVersion = null;
  mockSelectedIsPending = false;
  mockViewabilityCallback = null;
  mockScrollOffset = 0;
  mockActiveAnswerId = null;
  mockFollowingAnswers = [structuredAnswer('following-answer')];
  mockPlainBodies.clear();
  mockPlainCollapses.clear();
  mockStructuredBodies.clear();
});

test('starts the selected answer expanded and lets the floating bar collapse it while preserving its renderer', async () => {
  // Reading deep in the expanded cards: their starts are above the viewport.
  mockScrollOffset = 3000;
  const { element } = createHost();
  const host = await render(element);
  expect(host.getAllByText('发布于 2026-10-18 · IP 属地天津')).toHaveLength(2);
  expect(host.getAllByText('编辑于 2026-10-19')).toHaveLength(2);
  for (const id of ['selected-answer', 'following-answer']) {
    expect(mockRenderEndorsements).toHaveBeenCalledWith(
      expect.objectContaining({
        endorsements: mockPlainAnswer(id).endorsements,
      }),
    );
    expect(mockRenderCardActions).toHaveBeenCalledWith(
      expect.objectContaining({
        id,
        engagementType: 'answers',
        isCollected: false,
        collectionCount: mockPlainAnswer(id).favlists_count,
        showDownvote: true,
      }),
    );
  }
  expect(host.getByTestId('plain-body:selected-answer').props.children).toBe(
    mockPlainAnswer('selected-answer').content,
  );
  expect(mockPlainBodies.get('selected-answer')).toMatchObject({
    selectable: true,
    onRefresh: expect.any(Function),
  });
  expect(host.getByTestId('plain-toggle:selected-answer')).toHaveProp(
    'accessibilityState',
    { expanded: true },
  );
  expect(mockStructuredBodies.get('following-answer')).toMatchObject({
    collapseMode: 'height',
  });
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  expectExpandedIds(['selected-answer']);
  expect(mockRenderFloatingBar).toHaveBeenLastCalledWith(
    expect.objectContaining({ canCollapse: true }),
  );
  await act(() =>
    mockRenderFloatingBar.mock.calls.at(-1)?.[0].onCollapse('selected-answer'),
  );
  // The card gap stays visible below the header once the scroll lands.
  expect(mockScrollToIndex).toHaveBeenCalledWith({
    index: 0,
    animated: true,
    viewOffset: -88,
  });
  await waitFor(() => expectExpandedIds([]));
  expect(host.getByTestId('plain-toggle:selected-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  expect(mockRenderFloatingBar).toHaveBeenLastCalledWith(
    expect.objectContaining({ canCollapse: false }),
  );
  expect(mockPlainBodies.get('selected-answer')?.content).toBe(
    mockPlainAnswer('selected-answer').content,
  );
  await fireEvent.press(host.getByTestId('plain-toggle:selected-answer'));
  expectExpandedIds(['selected-answer']);
  expect(mockRenderFloatingBar).toHaveBeenLastCalledWith(
    expect.objectContaining({ canCollapse: true }),
  );

  mockActiveAnswerId = 'following-answer';
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  expectExpandedIds(['selected-answer', 'following-answer']);
  expect(mockRenderFloatingBar).toHaveBeenLastCalledWith(
    expect.objectContaining({ canCollapse: true }),
  );
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: true },
  );
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  // Collapsing scrolls back to the answer start before its height shrinks.
  expect(mockScrollToIndex).toHaveBeenCalledWith(
    expect.objectContaining({ index: 1, animated: true }),
  );
  expectExpandedIds(['selected-answer', 'following-answer']);
  await waitFor(() => expectExpandedIds(['selected-answer']));
  await host.unmount();
});

test('passes each answer collection state and count to its inline actions', async () => {
  const followingAnswer = structuredAnswer('collected-following-answer');
  followingAnswer.relationship.is_favorited = true;
  followingAnswer.favlists_count = 123;
  mockFollowingAnswers = [followingAnswer];
  const { element } = createHost();
  await render(element);
  expect(mockRenderCardActions).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'selected-answer', isCollected: false }),
  );
  expect(mockRenderCardActions).toHaveBeenCalledWith(
    expect.objectContaining({
      id: followingAnswer.id,
      isCollected: true,
      collectionCount: 123,
    }),
  );
});

test('refresh restores the selected answer and collapses later answers for both viewport hooks', async () => {
  const { client, element } = createHost();
  const resetQueries = jest.spyOn(client, 'resetQueries');
  const host = await render(element);
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  await fireEvent.press(host.getByTestId('plain-toggle:selected-answer'));
  expectExpandedIds(['following-answer']);

  await fireEvent.press(host.getByTestId('refresh-preview-list'));
  expect(mockRefetchSelected).toHaveBeenCalledTimes(1);
  expect(resetQueries).toHaveBeenCalledWith({
    queryKey: ['answer-preview-list', 'selected-answer', 1],
    exact: true,
  });
  expectExpandedIds(['selected-answer']);
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  expect(host.getByTestId('plain-toggle:selected-answer')).toHaveProp(
    'accessibilityState',
    { expanded: true },
  );
  await host.unmount();
});

test('route and account changes keep only the current selected answer expanded and discard old callbacks', async () => {
  const { element, screen } = createHost('selected-a');
  const host = await render(element);
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  const staleExpansion =
    mockStructuredBodies.get('following-answer')?.onExpandedChange;
  const staleSelectedExpansion =
    mockPlainCollapses.get('selected-a')?.onExpandedChange;
  expectExpandedIds(['selected-a', 'following-answer']);
  await fireEvent.press(host.getByTestId('plain-toggle:selected-a'));
  expectExpandedIds(['following-answer']);

  await host.rerender(screen('selected-b'));
  expectExpandedIds(['selected-b']);
  expect(host.queryByTestId('plain-body:selected-a')).toBeNull();
  await act(() => {
    staleExpansion?.(true);
    staleSelectedExpansion?.(true);
  });
  expectExpandedIds(['selected-b']);

  await host.rerender(screen('selected-a'));
  expectExpandedIds(['selected-a']);
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  mockScrollToIndex.mockClear();
  await act(() => {
    staleExpansion?.(true);
    staleSelectedExpansion?.(false);
  });
  expectExpandedIds(['selected-a']);
  expect(mockScrollToIndex).not.toHaveBeenCalled();

  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  await fireEvent.press(host.getByTestId('plain-toggle:selected-a'));
  const previousAccountExpansion =
    mockPlainCollapses.get('selected-a')?.onExpandedChange;
  expectExpandedIds(['following-answer']);
  mockSessionVersion = 2;
  await host.rerender(screen('selected-a'));
  expectExpandedIds(['selected-a']);
  expect(mockFloatingBar.mock.calls.at(-1)?.[0].scope).toContain('[2,');
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  await act(() => previousAccountExpansion?.(false));
  expectExpandedIds(['selected-a']);
  expect(host.getByTestId('plain-toggle:selected-a')).toHaveProp(
    'accessibilityState',
    { expanded: true },
  );
  await host.unmount();
});

test('touches only visible expanded bodies and pauses the selected answer when collapsed', async () => {
  const { element } = createHost();
  const host = await render(element);
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);

  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => viewabilityCallback()(visibleAnswers('selected-answer')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-answer'], true);

  await act(() =>
    viewabilityCallback()(
      visibleAnswers('selected-answer', 'following-answer', 'not-in-list'),
    ),
  );
  expect(mockReadTouch).toHaveBeenLastCalledWith(
    ['selected-answer', 'following-answer'],
    true,
  );
  await fireEvent.press(host.getByTestId('plain-toggle:selected-answer'));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['following-answer'], true);
  await fireEvent.press(host.getByTestId('plain-toggle:selected-answer'));
  expect(mockReadTouch).toHaveBeenLastCalledWith(
    ['selected-answer', 'following-answer'],
    true,
  );
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  // Collapse lands after the jump to the answer start (two animation frames).
  await waitFor(() =>
    expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-answer'], true),
  );
  await act(() =>
    viewabilityCallback()({
      viewableItems: [
        { item: mockPlainAnswer('selected-answer'), isViewable: false },
        { item: structuredAnswer('following-answer'), isViewable: true },
      ],
    }),
  );
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['following-answer'], true);
  await host.unmount();
});

test('requires a visible plain neighboring body to be expanded before touching it', async () => {
  mockFollowingAnswers = [mockPlainAnswer('plain-neighbor')];
  const { element } = createHost();
  const host = await render(element);
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);

  await act(() => viewabilityCallback()(visibleAnswers('plain-neighbor')));
  expectExpandedIds(['selected-answer']);
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await fireEvent.press(host.getByTestId('plain-toggle:plain-neighbor'));
  expectExpandedIds(['selected-answer', 'plain-neighbor']);
  expect(mockReadTouch).toHaveBeenLastCalledWith(['plain-neighbor'], true);
  await fireEvent.press(host.getByTestId('plain-toggle:plain-neighbor'));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => viewabilityCallback()(visibleAnswers()));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await host.unmount();
});

test('clears visible answers across route and account changes and ignores previous list callbacks', async () => {
  const { element, screen } = createHost('selected-a');
  const host = await render(element);
  const firstCallback = viewabilityCallback();
  await act(() => firstCallback(visibleAnswers('selected-a')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-a'], true);

  await host.rerender(screen('selected-b'));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => firstCallback(visibleAnswers('selected-b')));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => viewabilityCallback()(visibleAnswers('selected-b')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-b'], true);

  await host.rerender(screen('selected-a'));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => firstCallback(visibleAnswers('selected-a')));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  const previousAccountCallback = viewabilityCallback();
  await act(() => previousAccountCallback(visibleAnswers('selected-a')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-a'], true);

  mockSessionVersion = 2;
  await host.rerender(screen('selected-a'));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => previousAccountCallback(visibleAnswers('selected-a')));
  expect(mockReadTouch).toHaveBeenLastCalledWith([], true);
  await act(() => viewabilityCallback()(visibleAnswers('selected-a')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-a'], true);
});

test('does not enable touch while the entry is pending or its query session is stale', async () => {
  mockSelectedIsPending = true;
  const { element, screen } = createHost();
  const host = await render(element);
  expect(mockReadTouch).toHaveBeenLastCalledWith([], false);

  mockSelectedIsPending = false;
  await host.rerender(screen('selected-answer'));
  await act(() => viewabilityCallback()(visibleAnswers('selected-answer')));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-answer'], true);

  mockQuerySessionVersion = 1;
  mockSessionVersion = 2;
  await host.rerender(screen('selected-answer'));
  expect(mockReadTouch).toHaveBeenLastCalledWith(['selected-answer'], false);
});
