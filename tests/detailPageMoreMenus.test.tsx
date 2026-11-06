import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { Alert } from 'react-native';
import type {
  AnswerDetail,
  QuestionAnswersResponse,
} from '../src/api/zhihu/answer';
import { getQuestionAnswers } from '../src/api/zhihu/question';
import ArticleDetail from '../src/app/article/[id]';
import PinDetailScreen from '../src/app/pin/[id]';
import QuestionDetail from '../src/app/question/[id]/index';
import type { CollectionButton } from '../src/components/CollectionButton';
import type { ActionSheetOption } from '../src/components/overlays/ActionSheet';
import type { ZhihuContentProps } from '../src/features/rich-content';
import { seedAnswerPreviewEntry } from '../src/utils/answerPreviewEntry';
import { seedAnswerDetailFromList } from '../src/utils/contentCache';
import { seedGuestAnswerFromList } from '../src/utils/guestAnswer';

jest.mock('../src/utils/answerPreviewEntry', () => ({
  seedAnswerPreviewEntry: jest.fn(),
}));
jest.mock('../src/utils/contentCache', () => ({
  seedAnswerDetailFromList: jest.fn(),
}));
jest.mock('../src/utils/guestAnswer', () => ({
  seedGuestAnswerFromList: jest.fn(),
}));

interface DoubleTapActionOptions {
  id: string;
  type: string;
  commentType: string;
  voted: number;
  count: number;
  enabled: boolean;
}

const mockDoubleTapVote = jest.fn((_options: DoubleTapActionOptions) => ({
  gesture: { synthetic: true },
}));
jest.mock('../src/hooks/useDoubleTapAction', () => ({
  useDoubleTapAction: (options: DoubleTapActionOptions) =>
    mockDoubleTapVote(options),
}));

interface MenuProps {
  visible: boolean;
  onClose: () => void;
  type: string;
  data: Record<string, unknown> | null;
  additionalOptions?: ActionSheetOption[];
}

interface ListProps {
  data: AnswerDetail[];
  renderItem: (props: { item: AnswerDetail }) => React.ReactNode;
  ListHeaderComponent?: React.ReactNode | (() => React.ReactNode);
}

interface MutationOptions {
  onMutate?: () => { questionId: string };
  onSuccess?: (
    result: unknown,
    answerId: string | number,
    context?: { questionId: string },
  ) => void;
}

interface QuestionAnswersQueryOptions {
  queryKey: readonly unknown[];
  queryFn: (context: {
    pageParam?: number | string;
    signal: AbortSignal;
  }) => Promise<QuestionAnswersResponse>;
}

interface RelationshipNoticeProps {
  contentType: 'answer' | 'pin';
  contentId: string | number;
  voteCount?: number;
  enabled?: boolean;
}

let mockParams: { id: string; source?: string };
let mockQueryData: Record<string, unknown>;
let mockPausedQueries: Set<string>;
let mockMenuProps: MenuProps;
let mockMutationOptions: MutationOptions;
let mockInfiniteQueryOptions: QuestionAnswersQueryOptions;
const mockPush = jest.fn();
const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockDownvoteButton = jest.fn((_props: { voted?: number }) => null);
const mockRelationshipNotice = jest.fn((_props: RelationshipNoticeProps) => {});
const mockCollectionButton = jest.fn(
  (_props: React.ComponentProps<typeof CollectionButton>) => {},
);
const mockRichContent = jest.fn((_props: ZhihuContentProps) => {});
const mockQuestionRead = jest.fn();
let mockSessionVersion = 1;
const mockQueryKeys: Array<readonly unknown[]> = [];
const mockOptimisticQueryKeys: Array<readonly unknown[] | undefined> = [];
const mockAnswer: AnswerDetail = {
  id: '84',
  question: { id: '7', title: '合成问题', type: 'question' },
  author: {
    id: 'author',
    url_token: 'synthetic-author',
    name: '合成作者',
    avatar_url: '',
    type: 'people',
  },
  content: '<p>合成正文</p>',
  excerpt: '合成正文',
  created_time: 0,
  voteup_count: 1,
  comment_count: 2,
  favlists_count: 21,
  relationship: { is_author: true, is_favorited: true },
};

jest.mock('expo-router', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
    useNavigation: () => ({
      getState: () => ({ key: 'detail-stack' }),
      dispatch: jest.fn(),
    }),
    Stack: {
      Screen: ({
        options,
      }: {
        options: { headerRight?: () => React.ReactNode };
      }) => react.createElement(react.Fragment, null, options.headerRight?.()),
    },
  };
});
jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    mockQueryKeys.push(queryKey);
    return {
      data: mockQueryData[String(queryKey[0])],
      isLoading: false,
      isPending: mockQueryData[String(queryKey[0])] === undefined,
      isPaused: mockPausedQueries.has(String(queryKey[0])),
      isError: false,
      isFetchedAfterMount: false,
      refetch: jest.fn(),
    };
  },
  useInfiniteQuery: (options: QuestionAnswersQueryOptions) => {
    mockInfiniteQueryOptions = options;
    return {
      data: { pages: [{ data: [mockAnswer] }] },
      hasNextPage: false,
      isFetchingNextPage: false,
      isRefetching: false,
      isPending: false,
      isError: false,
      refetch: jest.fn(),
    };
  },
  useMutation: (options: MutationOptions) => {
    mockMutationOptions = options;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
    getQueryData: (queryKey: readonly unknown[]) =>
      mockQueryData[queryKey.join(':')],
  }),
}));
jest.mock('@shopify/flash-list', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    FlashList: ({ data, renderItem, ListHeaderComponent }: ListProps) =>
      react.createElement(
        native.View,
        null,
        typeof ListHeaderComponent === 'function'
          ? ListHeaderComponent()
          : ListHeaderComponent,
        data.map((item) =>
          react.createElement(
            react.Fragment,
            { key: item.id },
            renderItem({ item }),
          ),
        ),
      ),
    useRecyclingState: (value: unknown) => react.useState(value),
  };
});
jest.mock('react-native-gesture-handler', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const gesture = {
    enabled: () => gesture,
    numberOfTaps: () => gesture,
    runOnJS: () => gesture,
    activeOffsetX: () => gesture,
    failOffsetY: () => gesture,
    simultaneousWithExternalGesture: () => gesture,
    onStart: () => gesture,
    onUpdate: () => gesture,
    onEnd: () => gesture,
    onFinalize: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture, Tap: () => gesture },
    GestureDetector: native.View,
    RefreshControl: native.RefreshControl,
  };
});
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: {
      View: native.View,
      createAnimatedComponent: (component: unknown) => component,
    },
    SharedTransition: { duration: () => ({}) },
    useSharedValue: <Value,>(value: Value) => react.useRef({ value }).current,
    useDerivedValue: (compute: () => number) => ({ value: compute() }),
    useAnimatedStyle: (compute: () => object) => compute(),
    interpolate: () => 0,
    runOnJS: (callback: unknown) => callback,
    withTiming: (value: number) => value,
    withDelay: (_delay: number, value: number) => value,
    withSequence: (...values: number[]) => values.at(-1),
  };
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-blur', () => ({
  BlurView: jest.requireActual('react-native').View,
}));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: jest.requireActual('react-native').View,
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
    useRuntimeThemeColors: () => ({
      shadow: '#000000',
      contentOverlayStrong: '#ffffff',
      contentBorder: '#cccccc',
    }),
    ThemedIcon: () => null,
  };
});
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/ContentRelationshipNotice', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ContentRelationshipNotice: (props: RelationshipNoticeProps) => {
      mockRelationshipNotice(props);
      return react.createElement(
        native.Text,
        { testID: 'content-relationship-notice' },
        '合成互动关系提示',
      );
    },
  };
});
jest.mock('../src/components/DetailNavigationHeader', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useDetailNavigationHeight: () => 56,
    DetailNavigationHeader: ({
      onMore,
      moreAlwaysVisible,
    }: {
      onMore: () => void;
      moreAlwaysVisible?: boolean;
    }) =>
      moreAlwaysVisible
        ? react.createElement(native.Pressable, {
            accessibilityRole: 'button',
            accessibilityLabel: '问题更多操作',
            onPress: onMore,
          })
        : null,
  };
});
jest.mock('../src/components/ShareMenu', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ShareMenu: (props: MenuProps) => {
      mockMenuProps = props;
      if (!props.visible) return null;
      return react.createElement(
        native.View,
        null,
        react.createElement(
          native.Text,
          null,
          `menu:${props.type}:${props.data?.id}`,
        ),
        ...(props.additionalOptions ?? []).map((option) =>
          react.createElement(native.Pressable, {
            key: option.key,
            accessibilityRole: 'button',
            accessibilityLabel: option.label,
            onPress: option.onPress,
          }),
        ),
      );
    },
  };
});
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
  RetainedAvatar: () => null,
}));
jest.mock('../src/components/FollowButton', () => ({
  FollowButton: () => null,
}));
jest.mock('../src/components/LikeButton', () => ({ LikeButton: () => null }));
jest.mock('../src/components/CollectionButton', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    CollectionButton: (
      props: React.ComponentProps<typeof CollectionButton>,
    ) => {
      mockCollectionButton(props);
      return react.createElement(native.Pressable, {
        accessibilityRole: 'button',
        accessibilityLabel: '收藏',
        testID: `collection:${props.type}:${props.id}`,
        disabled: props.disabled,
      });
    },
  };
});
jest.mock('../src/components/DownvoteButton', () => ({
  DownvoteButton: (props: { voted?: number }) => mockDownvoteButton(props),
}));
jest.mock('../src/components/ReadingProgressNotice', () => ({
  ReadingProgressNotice: () => null,
}));
jest.mock('../src/components/VoterListModal', () => ({
  VoterListModal: () => null,
}));
jest.mock('../src/components/PinPollCard', () => ({ PinPollCard: () => null }));
jest.mock('../src/features/rich-content', () => ({
  RICH_CONTENT_STALE_TIME: 60_000,
  ZhihuContent: (props: ZhihuContentProps) => {
    mockRichContent(props);
    const react = jest.requireActual<typeof import('react')>('react');
    const native =
      jest.requireActual<typeof import('react-native')>('react-native');
    return react.createElement(
      native.Text,
      { testID: 'detail-body' },
      '合成正文',
    );
  },
}));
jest.mock('../src/hooks/useReadingProgress', () => ({
  useReadingProgress: () => ({ restoredOffset: null }),
}));
jest.mock('../src/hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: (options: { queryKey?: readonly unknown[] }) => {
    mockOptimisticQueryKeys.push(options.queryKey);
    return { mutate: jest.fn(), isPending: false };
  },
}));
jest.mock('../src/hooks/useQuestionRead', () => ({
  useQuestionRead: (id: string, sessionVersion: number, ready: boolean) =>
    mockQuestionRead(id, sessionVersion, ready),
}));
jest.mock('../src/hooks/useScrollAnimation', () => ({
  useScrollHeaderAnim: () => ({ handleScroll: jest.fn() }),
}));
jest.mock('../src/hooks/useScrollAwareTextSelection', () => ({
  useScrollAwareTextSelection: () => ({
    isTextSelectable: true,
    touchCaptureHandlers: {},
  }),
}));
jest.mock('../src/hooks/useGestureScrollView', () => ({
  useGestureScrollView: () => ({
    scrollGestureRef: {},
    renderScrollComponent: jest.fn(),
  }),
}));
jest.mock('../src/hooks/useViewableItems', () => ({
  useViewableItems: () => ({
    activeItem: mockAnswer,
    viewableIdsRef: { current: [] },
    viewabilityConfig: {},
    onViewableItemsChanged: jest.fn(),
  }),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: null }) => unknown) =>
    selector({ cookies: null }),
}));
jest.mock('../src/store/useCollectionStore', () => ({
  useCollectionStore: (
    selector: (state: {
      collectedStatusMap: Record<string, boolean>;
      setCollectedStatus: () => void;
    }) => unknown,
  ) => selector({ collectedStatusMap: {}, setCollectedStatus: jest.fn() }),
}));
jest.mock('../src/store/useSettingsStore', () => {
  const state = {
    enableBrowseHistory: false,
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
  };
  return {
    useSettingsStore: Object.assign(
      (selector: (value: typeof state) => unknown) => selector(state),
      { getState: () => state },
    ),
  };
});
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: () => false,
}));
jest.mock('../src/api/zhihu', () => ({
  ...jest.requireActual('../src/api/zhihu/contentCollection'),
  getArticle: jest.fn(),
  getDailyDetail: jest.fn(),
}));
jest.mock('../src/api/zhihu/answer', () => ({ deleteAnswer: jest.fn() }));
jest.mock('../src/api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../src/api/zhihu/column', () => ({
  followColumn: jest.fn(),
  getArticleColumnCard: jest.fn(),
  unfollowColumn: jest.fn(),
}));
jest.mock('../src/api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../src/api/zhihu/member', () => ({
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
}));
jest.mock('../src/api/zhihu/pin', () => ({ getPin: jest.fn() }));
jest.mock('../src/api/zhihu/question', () => ({
  followQuestion: jest.fn(),
  unfollowQuestion: jest.fn(),
  getQuestion: jest.fn(),
  getQuestionAnswers: jest.fn(),
}));
jest.mock('../src/api/zhihu/voters', () => ({
  getContentVoteCount: (_type: string, content?: { reaction_count?: number }) =>
    content?.reaction_count ?? 0,
  getContentVoteState: () => 0,
}));

const pressButton = (button: Parameters<typeof fireEvent.press>[0]) =>
  fireEvent.press(button, { stopPropagation: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockSessionVersion = 1;
  mockQueryKeys.length = 0;
  mockOptimisticQueryKeys.length = 0;
  mockParams = { id: '7' };
  mockPausedQueries = new Set();
  mockQueryData = {
    'article-collection-status': { data: [{ is_favorited: false }] },
    'zhihu-article': {
      id: '7',
      title: '合成文章',
      author: mockAnswer.author,
      content: '<p>正文</p>',
      favlists_count: 0,
    },
    'pin-detail': {
      id: '7',
      author: mockAnswer.author,
      content: [],
      comment_count: 0,
    },
    question: { id: '7', title: '合成问题', topics: [], answer_count: 1 },
    'daily-article': {
      id: '7',
      title: '合成日报',
      body: '<p>正文</p>',
      share_url: 'https://daily.zhihu.com/story/7',
    },
  };
});

test('question reads wait for the requested question and use a session-scoped detail cache', async () => {
  mockQueryData.question = undefined;
  const host = await render(<QuestionDetail />);
  expect(mockQuestionRead).toHaveBeenLastCalledWith('7', 1, false);
  mockQueryData.question = { id: '8', title: '旧问题', topics: [] };
  await host.rerender(<QuestionDetail />);
  expect(mockQuestionRead).toHaveBeenLastCalledWith('7', 1, false);
  mockQueryData.question = { id: '7', title: '合成问题', topics: [] };
  await host.rerender(<QuestionDetail />);
  expect(mockQuestionRead).toHaveBeenLastCalledWith('7', 1, true);
  expect(mockQueryKeys).toContainEqual(['question', '7', false, 1]);
  expect(mockOptimisticQueryKeys).toContainEqual(['question', '7', false, 1]);
  mockSessionVersion = 2;
  mockQueryData.question = undefined;
  await host.rerender(<QuestionDetail />);
  expect(mockQuestionRead).toHaveBeenLastCalledWith('7', 2, false);
  expect(mockQueryKeys).toContainEqual(['question', '7', false, 2]);
  expect(mockOptimisticQueryKeys).toContainEqual(['question', '7', false, 2]);
});

test('question answer lists isolate guest sessions and reject requests or clicks captured before a session change', async () => {
  const getAnswers = jest.mocked(getQuestionAnswers);
  getAnswers.mockReset();
  const host = await render(<QuestionDetail />);
  const previousQuery = mockInfiniteQueryOptions;
  expect(previousQuery.queryKey).toEqual([
    'question-answers',
    '7',
    'default',
    false,
    1,
  ]);
  expect(mockOptimisticQueryKeys).toContainEqual(previousQuery.queryKey);
  const signal = new AbortController().signal;
  let resolveRequest: ((page: QuestionAnswersResponse) => void) | undefined;
  getAnswers.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
  );
  const pending = previousQuery.queryFn({ pageParam: 20, signal });
  expect(getAnswers).toHaveBeenCalledWith(
    '7',
    20,
    'default',
    expect.any(String),
    { signal },
  );

  mockSessionVersion = 2;
  resolveRequest?.({ data: [mockAnswer] });
  await expect(pending).rejects.toMatchObject({ code: 'ERR_CANCELED' });
  await expect(previousQuery.queryFn({ signal })).rejects.toMatchObject({
    code: 'ERR_CANCELED',
  });
  expect(getAnswers).toHaveBeenCalledTimes(1);
  await pressButton(host.getByRole('button', { name: '阅读 合成作者 的回答' }));
  expect(seedGuestAnswerFromList).not.toHaveBeenCalled();
  expect(seedAnswerDetailFromList).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();

  await host.rerender(<QuestionDetail />);
  expect(mockInfiniteQueryOptions.queryKey).toEqual([
    'question-answers',
    '7',
    'default',
    false,
    2,
  ]);
  expect(mockOptimisticQueryKeys).toContainEqual(
    mockInfiniteQueryOptions.queryKey,
  );
  getAnswers.mockResolvedValueOnce({ data: [mockAnswer] });
  await expect(mockInfiniteQueryOptions.queryFn({ signal })).resolves.toEqual({
    data: [mockAnswer],
  });
});

test.each([
  {
    type: 'article',
    Screen: ArticleDetail,
    query: 'zhihu-article',
    source: undefined,
    loadingMessage: '正赶往知识的荒原...喵',
  },
  {
    type: 'daily',
    Screen: ArticleDetail,
    query: 'daily-article',
    source: 'daily',
    loadingMessage: '正赶往知识的荒原...喵',
  },
  {
    type: 'pin',
    Screen: PinDetailScreen,
    query: 'pin-detail',
    source: undefined,
    loadingMessage: '载入想法中...喵',
  },
])(
  '$type waits for its first paused request instead of reporting deleted content',
  async ({ Screen, query, source, loadingMessage }) => {
    mockParams = { id: '7', source };
    const content = mockQueryData[query];
    mockQueryData[query] = undefined;
    mockPausedQueries.add(query);

    const host = await render(<Screen />);
    expect(host.getByText(loadingMessage)).toBeOnTheScreen();
    expect(host.queryByText(/可能已被删除/)).toBeNull();
    expect(host.queryByTestId('detail-body')).toBeNull();

    mockQueryData[query] = content;
    await host.rerender(<Screen />);
    expect(host.queryByText(loadingMessage)).toBeNull();
    expect(host.getByTestId('detail-body')).toBeOnTheScreen();
  },
);

test('both article more buttons directly open the same article menu', async () => {
  const host = await render(<ArticleDetail />);
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: '7',
      type: 'article',
      isCollected: false,
      count: 0,
    }),
  );
  expect(
    host
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .filter((label) => label === '收藏' || label === '评论'),
  ).toEqual(['收藏', '评论']);
  const buttons = host.getAllByRole('button', { name: '更多操作' });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    await pressButton(button);
    expect(host.getByText('menu:article:7')).toBeTruthy();
    expect(mockMenuProps.data?.url).toBe('https://zhuanlan.zhihu.com/p/7');
    expect(mockMenuProps.data?.isCollected).toBe(false);
    expect(mockMenuProps.additionalOptions).toBeUndefined();
    await act(() => mockMenuProps.onClose());
  }
});

test.each([-1, 0, 1])(
  'article action bar preserves voting state %d',
  async (voting) => {
    mockQueryData['zhihu-article'] = {
      ...(mockQueryData['zhihu-article'] as object),
      relationship: { voting },
    };
    await render(<ArticleDetail />);
    expect(mockDownvoteButton).toHaveBeenLastCalledWith(
      expect.objectContaining({ voted: voting }),
    );
  },
);

test.each(['https://daily.zhihu.com/story/7?source=synthetic', undefined])(
  'daily more uses a daily URL and never article collection data (%s)',
  async (shareUrl) => {
    mockParams = { id: '7', source: 'daily' };
    mockQueryData['daily-article'] = {
      title: '合成日报',
      body: '<p>正文</p>',
      share_url: shareUrl,
    };
    const host = await render(<ArticleDetail />);
    expect(host.queryByRole('button', { name: '收藏' })).toBeNull();
    expect(mockCollectionButton).not.toHaveBeenCalled();
    await pressButton(host.getByRole('button', { name: '更多操作' }));
    expect(host.getByText('menu:daily:7')).toBeTruthy();
    expect(mockMenuProps.data?.url).toBe(
      shareUrl ?? 'https://daily.zhihu.com/story/7',
    );
    expect(mockMenuProps.data?.isCollected).toBeUndefined();
  },
);

test('pin header and bottom more buttons open the same pin menu', async () => {
  const host = await render(<PinDetailScreen />);
  expect(host.queryByRole('button', { name: '收藏' })).toBeNull();
  expect(mockCollectionButton).not.toHaveBeenCalled();
  const buttons = host.getAllByRole('button', { name: '更多操作' });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    await pressButton(button);
    expect(host.getByText('menu:pin:7')).toBeTruthy();
    await act(() => mockMenuProps.onClose());
  }
});

test('uses the selected daily body and leaves the cached article author out of sharing', async () => {
  mockParams = { id: '7', source: 'daily' };
  mockQueryData['daily-article'] = {
    title: '合成日报',
    body: '<p>选定日报正文</p>',
  };
  const host = await render(<ArticleDetail />);
  expect(mockRichContent).toHaveBeenLastCalledWith(
    expect.objectContaining({
      content: '<p>选定日报正文</p>',
      variant: 'daily',
    }),
  );
  await pressButton(host.getByRole('button', { name: '更多操作' }));
  expect(mockMenuProps.data?.author).toBeUndefined();
});

test('places the pin relationship notice before its body using the loaded pin identity and reaction count', async () => {
  mockQueryData['pin-detail'] = {
    ...(mockQueryData['pin-detail'] as object),
    reaction_count: 34,
  };
  const host = await render(<PinDetailScreen />);

  expect(mockRelationshipNotice).toHaveBeenLastCalledWith({
    contentType: 'pin',
    contentId: '7',
    voteCount: 34,
  });
  expect(
    host
      .getAllByTestId(/^(content-relationship-notice|detail-body)$/)
      .map((node) => node.props.testID),
  ).toEqual(['content-relationship-notice', 'detail-body']);
  expect(host.getByTestId('detail-body')).toHaveTextContent('合成正文');

  mockParams = { id: '8' };
  mockQueryData['pin-detail'] = undefined;
  await host.rerender(<PinDetailScreen />);
  expect(host.queryByTestId('content-relationship-notice')).toBeNull();

  mockQueryData['pin-detail'] = {
    id: '8',
    author: mockAnswer.author,
    content: [],
    reaction_count: 12,
  };
  await host.rerender(<PinDetailScreen />);
  expect(mockRelationshipNotice).toHaveBeenLastCalledWith({
    contentType: 'pin',
    contentId: '8',
    voteCount: 12,
  });
  expect(host.getByTestId('detail-body')).toHaveTextContent('合成正文');
});

test.each([
  { type: 'article', Screen: ArticleDetail, query: 'zhihu-article' },
  { type: 'pin', Screen: PinDetailScreen, query: 'pin-detail' },
])(
  '$type menus close when the route changes and stay closed when new content finishes loading',
  async ({ type, Screen, query }) => {
    const original = mockQueryData[query] as object;
    const host = await render(<Screen />);
    await pressButton(host.getAllByRole('button', { name: '更多操作' })[0]);
    expect(host.getByText(`menu:${type}:7`)).toBeTruthy();

    mockParams = { id: '8' };
    mockQueryData[query] = undefined;
    await host.rerender(<Screen />);
    expect(host.queryByText(`menu:${type}:7`)).toBeNull();

    mockQueryData[query] = { ...original, id: '8', title: '新的合成内容' };
    await host.rerender(<Screen />);
    if (type === 'article') {
      expect(mockCollectionButton).toHaveBeenLastCalledWith(
        expect.objectContaining({ id: '8', type: 'article' }),
      );
      expect(host.queryByTestId('collection:article:7')).toBeNull();
    }
    expect(host.queryByText(`menu:${type}:8`)).toBeNull();
    expect(mockMenuProps.visible).toBe(false);

    mockParams = { id: '7' };
    mockQueryData[query] = original;
    await host.rerender(<Screen />);
    expect(host.queryByText(`menu:${type}:7`)).toBeNull();
  },
);

test('switching between an article and daily story with the same ID does not reuse an open menu', async () => {
  const host = await render(<ArticleDetail />);
  await pressButton(host.getAllByRole('button', { name: '更多操作' })[0]);
  expect(host.getByText('menu:article:7')).toBeTruthy();

  mockParams = { id: '7', source: 'daily' };
  await host.rerender(<ArticleDetail />);
  expect(host.queryByText('menu:daily:7')).toBeNull();
  expect(mockMenuProps.visible).toBe(false);

  await pressButton(host.getByRole('button', { name: '更多操作' }));
  expect(host.getByText('menu:daily:7')).toBeTruthy();
  mockParams = { id: '7' };
  await host.rerender(<ArticleDetail />);
  expect(host.queryByText('menu:article:7')).toBeNull();
});

test('question and answer more entries target distinct content and preserve author actions', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const host = await render(<QuestionDetail />);
  expect(mockCollectionButton).toHaveBeenLastCalledWith({
    id: '84',
    type: 'answer',
    isCollected: true,
    count: 21,
    variant: 'inline',
  });
  expect(
    host
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .filter((label) => label === '收藏' || label === '2 条回答评论'),
  ).toEqual(['收藏', '2 条回答评论']);
  await pressButton(host.getByRole('button', { name: '阅读 合成作者 的回答' }));
  expect(seedGuestAnswerFromList).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      id: mockAnswer.id,
      type: 'answer',
      content: mockAnswer.content,
      question: expect.objectContaining({ id: '7', title: '合成问题' }),
    }),
    1,
  );
  expect(seedAnswerDetailFromList).not.toHaveBeenCalled();
  expect(
    jest.mocked(seedGuestAnswerFromList).mock.invocationCallOrder[0],
  ).toBeLessThan(mockPush.mock.invocationCallOrder[0]);
  expect(seedAnswerPreviewEntry).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      id: mockAnswer.id,
      content: mockAnswer.content,
      question: expect.objectContaining({ id: '7', title: '合成问题' }),
    }),
  );
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/answer/[id]',
    params: {
      id: '84',
      questionId: '7',
      title: '合成问题',
      sortBy: 'default',
      answerScene: 'question_feed',
    },
  });
  await pressButton(host.getByRole('button', { name: '问题更多操作' }));
  expect(host.getByText('menu:question:7')).toBeTruthy();
  expect(mockMenuProps.data?.url).toBe('https://www.zhihu.com/question/7');
  expect(mockMenuProps.additionalOptions).toEqual([
    expect.objectContaining({ key: 'question-log', label: '查看问题日志' }),
  ]);
  await pressButton(host.getByRole('button', { name: '查看问题日志' }));
  expect(mockPush).toHaveBeenCalledWith('/question/7/log');
  await act(() => mockMenuProps.onClose());

  const answerButtons = host.getAllByRole('button', { name: '回答更多操作' });
  expect(answerButtons).toHaveLength(1);
  for (const button of answerButtons) {
    await pressButton(button);
    expect(host.getByText('menu:answer:84')).toBeTruthy();
    expect(mockMenuProps.data).toMatchObject({
      questionId: '7',
      isCollected: true,
      url: 'https://www.zhihu.com/question/7/answer/84',
    });
    await act(() => mockMenuProps.onClose());
  }

  await pressButton(answerButtons[0]);
  await pressButton(host.getByRole('button', { name: '编辑回答' }));
  expect(mockPush).toHaveBeenCalledWith('/question/write/7');
  await pressButton(host.getByRole('button', { name: '删除回答' }));
  expect(mockMutate).not.toHaveBeenCalled();
  const confirmation = alert.mock.calls
    .at(-1)?.[2]
    ?.find((button) => button.text === '确认删除');
  expect(confirmation).toBeDefined();
  await act(() => confirmation?.onPress?.());
  expect(mockMutate).toHaveBeenCalledWith('84');
  alert.mockRestore();
});

test('changing questions clears an open answer selection before constructing the new question menu', async () => {
  const host = await render(<QuestionDetail />);
  await pressButton(host.getAllByRole('button', { name: '回答更多操作' })[0]);
  expect(host.getByText('menu:answer:84')).toBeTruthy();

  mockParams = { id: '8' };
  mockQueryData.question = { id: '8', title: '另一个合成问题', topics: [] };
  await host.rerender(<QuestionDetail />);
  expect(host.queryByText('menu:answer:84')).toBeNull();
  expect(mockMenuProps.visible).toBe(false);
  expect(mockMenuProps.type).toBe('question');
  expect(mockMenuProps.data).toMatchObject({
    id: '8',
    url: 'https://www.zhihu.com/question/8',
  });
  expect(mockMenuProps.additionalOptions).toEqual([
    expect.objectContaining({ key: 'question-log', label: '查看问题日志' }),
  ]);

  await pressButton(host.getByRole('button', { name: '问题更多操作' }));
  expect(host.getByText('menu:question:8')).toBeTruthy();
  mockParams = { id: '7' };
  mockQueryData.question = { id: '7', title: '合成问题', topics: [] };
  await host.rerender(<QuestionDetail />);
  expect(host.queryByText('menu:question:7')).toBeNull();
  expect(mockMenuProps.type).toBe('question');
  expect(mockMenuProps.data?.id).toBe('7');
});

test('deletion refreshes every sort of its original question even if the displayed question changes', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const host = await render(<QuestionDetail />);
  const origin = mockMutationOptions.onMutate?.();
  expect(origin).toEqual({ questionId: '7' });

  mockParams = { id: '8' };
  mockQueryData.question = { id: '8', title: '另一个合成问题', topics: [] };
  await host.rerender(<QuestionDetail />);
  await act(() => mockMutationOptions.onSuccess?.(undefined, '84', origin));

  expect(mockInvalidateQueries).toHaveBeenCalledWith({
    queryKey: ['question-answers', '7'],
  });
  alert.mockRestore();
});

test.each([
  {
    name: 'article',
    Screen: ArticleDetail,
    source: undefined,
    expected: {
      id: '7',
      type: 'articles',
      commentType: 'article',
      voted: 0,
      count: 0,
      enabled: true,
    },
  },
  {
    name: 'pin',
    Screen: PinDetailScreen,
    source: undefined,
    expected: {
      id: '7',
      type: 'pins',
      commentType: 'pin',
      voted: 0,
      count: 0,
      enabled: true,
    },
  },
])(
  'the $name detail page wires double-tap voting to its own content and vote state',
  async ({ Screen, source, expected }) => {
    mockParams = { id: '7', ...(source ? { source } : {}) };
    mockDoubleTapVote.mockClear();
    await render(<Screen />);

    expect(mockDoubleTapVote).toHaveBeenCalledWith(expected);
  },
);

test('a daily story never wires double-tap voting to article endpoints', async () => {
  mockParams = { id: '7', source: 'daily' };
  mockDoubleTapVote.mockClear();
  await render(<ArticleDetail />);

  expect(mockDoubleTapVote).toHaveBeenCalledWith(
    expect.objectContaining({ enabled: false }),
  );
});
