import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';
import type {
  ZhihuPlainPreviewAnswer,
  ZhihuPreviewAnswer,
  ZhihuReadingPreviewItem,
} from '../api/zhihu/nextRender';
import type { AnswerEndorsements } from '../components/AnswerEndorsements';
import { AnswerPreviewList } from '../components/AnswerPreviewList';
import type { FeedCardActionRow } from '../components/FeedCardActionRow';
import type {
  ZhihuContentProps,
  ZhihuStructuredContentProps,
} from '../features/rich-content';
import type { useAnswerPreviewAutoLoad } from '../hooks/useAnswerPreviewAutoLoad';
import type { useAnswerPreviewFloatingBar } from '../hooks/useAnswerPreviewFloatingBar';

let mockSessionVersion = 1;
let mockActiveAnswerId: string | null = null;
let mockFollowingAnswers: ZhihuPreviewAnswer[] = [];
const mockPlainBodies = new Map<string, ZhihuContentProps>();
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
jest.mock('../api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: (
    selector: (state: { enableBrowseHistory: boolean }) => unknown,
  ) => selector({ enableBrowseHistory: false }),
}));
jest.mock('../hooks/useAnswerPreviewQuery', () => ({
  useAnswerPreviewQuery: ({ answerId }: { answerId: string }) => ({
    items: [mockPlainAnswer(answerId), ...mockFollowingAnswers],
    sessionVersion: mockSessionVersion,
    queryKey: ['answer-preview-list', answerId, mockSessionVersion],
    selectedIsPending: false,
    selectedIsError: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    refetchSelected: mockRefetchSelected,
  }),
}));
jest.mock('../hooks/useAnswerPreviewFloatingBar', () => ({
  useAnswerPreviewFloatingBar: (
    options: Parameters<typeof useAnswerPreviewFloatingBar>[0],
  ) => mockFloatingBar(options),
}));
jest.mock('../hooks/useAnswerPreviewAutoLoad', () => ({
  useAnswerPreviewAutoLoad: (
    options: Parameters<typeof useAnswerPreviewAutoLoad>[0],
  ) => mockAutoLoad(options),
}));
jest.mock('../hooks/useAnswerPreviewBody', () => ({
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
jest.mock('../hooks/useDetailHeaderState', () => ({
  useDetailHeaderState: () => ({
    collapsed: false,
    onScrollOffset: jest.fn(),
    onHeaderLayout: jest.fn(),
  }),
}));
jest.mock('../components/Themed', () => {
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
jest.mock('../components/ContentActionBar', () => ({
  CONTENT_ACTION_BAR_HEIGHT: 48,
  getContentActionBarBottom: (inset: number) => Math.max(inset, 12) + 20,
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../components/DetailNavigationHeader', () => ({
  DetailNavigationHeader: () => null,
  useDetailNavigationHeight: () => 56,
}));
jest.mock('../components/AnswerPreviewFloatingBar', () => ({
  AnswerPreviewFloatingBar: (props: {
    canCollapse?: boolean;
    onCollapse: (id: string) => void;
  }) => mockRenderFloatingBar(props),
}));
jest.mock('../components/AnswerPreviewQuestionHeader', () => ({
  AnswerPreviewQuestionHeader: () => null,
}));
jest.mock('../components/FeedCardActionRow', () => ({
  FeedCardActionRow: (props: ComponentProps<typeof FeedCardActionRow>) =>
    mockRenderCardActions(props),
}));
jest.mock('../components/AnswerEndorsements', () => ({
  AnswerEndorsements: (props: ComponentProps<typeof AnswerEndorsements>) =>
    mockRenderEndorsements(props),
}));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../components/ShareMenu', () => ({ ShareMenu: () => null }));
jest.mock('../features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
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
        }: {
          data: ZhihuReadingPreviewItem[];
          renderItem: (info: {
            item: ZhihuReadingPreviewItem;
            index: number;
          }) => ReactNode;
          keyExtractor: (item: ZhihuReadingPreviewItem) => string;
          refreshControl: ReactNode;
        },
        ref,
      ) => {
        react.useImperativeHandle(ref, () => ({
          scrollToIndex: mockScrollToIndex,
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

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  mockActiveAnswerId = null;
  mockFollowingAnswers = [structuredAnswer('following-answer')];
  mockPlainBodies.clear();
  mockStructuredBodies.clear();
});

test('keeps the selected plain answer complete and interactive while later answers remain collapsible', async () => {
  const { element } = createHost();
  const host = await render(element);
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
  expect(host.queryByTestId('answer-preview-plain-toggle')).toBeNull();
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  expectExpandedIds(['selected-answer']);
  expect(mockRenderFloatingBar).toHaveBeenLastCalledWith(
    expect.objectContaining({ canCollapse: false }),
  );
  await act(() =>
    mockRenderFloatingBar.mock.calls.at(-1)?.[0].onCollapse('selected-answer'),
  );
  expectExpandedIds(['selected-answer']);
  expect(mockScrollToIndex).not.toHaveBeenCalled();

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
  expectExpandedIds(['selected-answer']);
  expect(mockScrollToIndex).toHaveBeenCalledWith(
    expect.objectContaining({ index: 1 }),
  );
  expect(host.queryByTestId('answer-preview-plain-toggle')).toBeNull();
});

test('refresh resets later answers while keeping the selected answer expanded for both viewport hooks', async () => {
  const { client, element } = createHost();
  const resetQueries = jest.spyOn(client, 'resetQueries');
  const host = await render(element);
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  expectExpandedIds(['selected-answer', 'following-answer']);

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
  expect(host.queryByTestId('answer-preview-plain-toggle')).toBeNull();
});

test('route and account changes keep only the current selected answer expanded and discard old callbacks', async () => {
  const { element, screen } = createHost('selected-a');
  const host = await render(element);
  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  const staleExpansion =
    mockStructuredBodies.get('following-answer')?.onExpandedChange;
  expectExpandedIds(['selected-a', 'following-answer']);

  await host.rerender(screen('selected-b'));
  expectExpandedIds(['selected-b']);
  expect(host.queryByTestId('plain-body:selected-a')).toBeNull();
  await act(() => staleExpansion?.(true));
  expectExpandedIds(['selected-b']);

  await host.rerender(screen('selected-a'));
  expectExpandedIds(['selected-a']);
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );

  await fireEvent.press(host.getByTestId('structured-toggle:following-answer'));
  mockSessionVersion = 2;
  await host.rerender(screen('selected-a'));
  expectExpandedIds(['selected-a']);
  expect(mockFloatingBar.mock.calls.at(-1)?.[0].scope).toContain('[2,');
  expect(host.getByTestId('structured-toggle:following-answer')).toHaveProp(
    'accessibilityState',
    { expanded: false },
  );
  expect(host.queryByTestId('answer-preview-plain-toggle')).toBeNull();
});
