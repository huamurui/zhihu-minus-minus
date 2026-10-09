import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { Alert } from 'react-native';
import type { AnswerDetail } from '../api/zhihu/answer';
import ArticleDetail from '../app/article/[id]';
import PinDetailScreen from '../app/pin/[id]';
import QuestionDetail from '../app/question/[id]/index';
import type { ActionSheetOption } from '../components/overlays/ActionSheet';
import { seedAnswerPreviewEntry } from '../utils/answerPreviewEntry';
import { seedAnswerDetailFromList } from '../utils/contentCache';

jest.mock('../utils/answerPreviewEntry', () => ({
  seedAnswerPreviewEntry: jest.fn(),
}));
jest.mock('../utils/contentCache', () => ({
  seedAnswerDetailFromList: jest.fn(),
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

let mockParams: { id: string; source?: string };
let mockQueryData: Record<string, unknown>;
let mockMenuProps: MenuProps;
let mockMutationOptions: MutationOptions;
const mockPush = jest.fn();
const mockMutate = jest.fn();
const mockInvalidateQueries = jest.fn();
const mockDownvoteButton = jest.fn((_props: { voted?: number }) => null);
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
  relationship: { is_author: true, is_favorited: true },
};

jest.mock('expo-router', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    useLocalSearchParams: () => mockParams,
    useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: mockQueryData[String(queryKey[0])],
    isLoading: false,
    isError: false,
    isFetchedAfterMount: false,
    refetch: jest.fn(),
  }),
  useInfiniteQuery: () => ({
    data: { pages: [{ data: [mockAnswer] }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isRefetching: false,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useMutation: (options: MutationOptions) => {
    mockMutationOptions = options;
    return { mutate: mockMutate, isPending: false };
  },
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
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
    activeOffsetX: () => gesture,
    failOffsetY: () => gesture,
    simultaneousWithExternalGesture: () => gesture,
    onStart: () => gesture,
    onUpdate: () => gesture,
    onEnd: () => gesture,
    onFinalize: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture },
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
jest.mock('../components/Themed', () => {
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
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/DetailNavigationHeader', () => {
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
jest.mock('../components/ShareMenu', () => {
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
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/FollowButton', () => ({ FollowButton: () => null }));
jest.mock('../components/LikeButton', () => ({ LikeButton: () => null }));
jest.mock('../components/DownvoteButton', () => ({
  DownvoteButton: (props: { voted?: number }) => mockDownvoteButton(props),
}));
jest.mock('../components/ReadingProgressNotice', () => ({
  ReadingProgressNotice: () => null,
}));
jest.mock('../components/VoterListModal', () => ({
  VoterListModal: () => null,
}));
jest.mock('../components/PinPollCard', () => ({ PinPollCard: () => null }));
jest.mock('../features/rich-content', () => ({
  RICH_CONTENT_STALE_TIME: 60_000,
  ZhihuContent: () => null,
}));
jest.mock('../hooks/useReadingProgress', () => ({
  useReadingProgress: () => ({ restoredOffset: null }),
}));
jest.mock('../hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../hooks/useScrollAnimation', () => ({
  useScrollHeaderAnim: () => ({ handleScroll: jest.fn() }),
}));
jest.mock('../hooks/useScrollAwareTextSelection', () => ({
  useScrollAwareTextSelection: () => ({
    isTextSelectable: true,
    touchCaptureHandlers: {},
  }),
}));
jest.mock('../hooks/useGestureScrollView', () => ({
  useGestureScrollView: () => ({
    scrollGestureRef: {},
    renderScrollComponent: jest.fn(),
  }),
}));
jest.mock('../hooks/useViewableItems', () => ({
  useViewableItems: () => ({
    activeItem: mockAnswer,
    viewableIdsRef: { current: [] },
    viewabilityConfig: {},
    onViewableItemsChanged: jest.fn(),
  }),
}));
jest.mock('../store/useAuthStore', () => ({
  useAuthStore: (selector: (state: { cookies: null }) => unknown) =>
    selector({ cookies: null }),
}));
jest.mock('../store/useCollectionStore', () => ({
  useCollectionStore: (
    selector: (state: {
      collectedStatusMap: Record<string, boolean>;
      setCollectedStatus: () => void;
    }) => unknown,
  ) => selector({ collectedStatusMap: {}, setCollectedStatus: jest.fn() }),
}));
jest.mock('../store/useSettingsStore', () => {
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
jest.mock('../api/client', () => ({ hasAuthenticationCookie: () => false }));
jest.mock('../api/zhihu', () => ({
  getArticle: jest.fn(),
  getDailyDetail: jest.fn(),
}));
jest.mock('../api/zhihu/answer', () => ({ deleteAnswer: jest.fn() }));
jest.mock('../api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../api/zhihu/column', () => ({
  followColumn: jest.fn(),
  getArticleColumnCard: jest.fn(),
  unfollowColumn: jest.fn(),
}));
jest.mock('../api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../api/zhihu/member', () => ({
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
}));
jest.mock('../api/zhihu/pin', () => ({ getPin: jest.fn() }));
jest.mock('../api/zhihu/question', () => ({
  followQuestion: jest.fn(),
  unfollowQuestion: jest.fn(),
  getQuestion: jest.fn(),
  getQuestionAnswers: jest.fn(),
}));
jest.mock('../api/zhihu/voters', () => ({
  getContentVoteCount: () => 0,
  getContentVoteState: () => 0,
}));

const pressButton = (button: Parameters<typeof fireEvent.press>[0]) =>
  fireEvent.press(button, { stopPropagation: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '7' };
  mockQueryData = {
    'article-collection-status': { data: [{ is_favorited: false }] },
    'zhihu-article': {
      id: '7',
      title: '合成文章',
      author: mockAnswer.author,
      content: '<p>正文</p>',
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

test('both article more buttons directly open the same article menu', async () => {
  const host = await render(<ArticleDetail />);
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

test.each([
  -1, 0, 1,
])('article action bar preserves voting state %d', async (voting) => {
  mockQueryData['zhihu-article'] = {
    ...(mockQueryData['zhihu-article'] as object),
    relationship: { voting },
  };
  await render(<ArticleDetail />);
  expect(mockDownvoteButton).toHaveBeenLastCalledWith(
    expect.objectContaining({ voted: voting }),
  );
});

test.each([
  'https://daily.zhihu.com/story/7?source=synthetic',
  undefined,
])('daily more uses a daily URL and never article collection data (%s)', async (shareUrl) => {
  mockParams = { id: '7', source: 'daily' };
  mockQueryData['daily-article'] = {
    title: '合成日报',
    body: '<p>正文</p>',
    share_url: shareUrl,
  };
  const host = await render(<ArticleDetail />);
  await pressButton(host.getByRole('button', { name: '更多操作' }));
  expect(host.getByText('menu:daily:7')).toBeTruthy();
  expect(mockMenuProps.data?.url).toBe(
    shareUrl ?? 'https://daily.zhihu.com/story/7',
  );
  expect(mockMenuProps.data?.isCollected).toBeUndefined();
});

test('pin header and bottom more buttons open the same pin menu', async () => {
  const host = await render(<PinDetailScreen />);
  const buttons = host.getAllByRole('button', { name: '更多操作' });
  expect(buttons).toHaveLength(2);
  for (const button of buttons) {
    await pressButton(button);
    expect(host.getByText('menu:pin:7')).toBeTruthy();
    await act(() => mockMenuProps.onClose());
  }
});

test.each([
  { type: 'article', Screen: ArticleDetail, query: 'zhihu-article' },
  { type: 'pin', Screen: PinDetailScreen, query: 'pin-detail' },
])('$type menus close when the route changes and stay closed when new content finishes loading', async ({
  type,
  Screen,
  query,
}) => {
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
  expect(host.queryByText(`menu:${type}:8`)).toBeNull();
  expect(mockMenuProps.visible).toBe(false);

  mockParams = { id: '7' };
  mockQueryData[query] = original;
  await host.rerender(<Screen />);
  expect(host.queryByText(`menu:${type}:7`)).toBeNull();
});

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
  await pressButton(host.getByRole('button', { name: '阅读 合成作者 的回答' }));
  expect(seedAnswerDetailFromList).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      id: mockAnswer.id,
      type: 'answer',
      content: mockAnswer.content,
      question: expect.objectContaining({ id: '7', title: '合成问题' }),
    }),
  );
  expect(
    jest.mocked(seedAnswerDetailFromList).mock.invocationCallOrder[0],
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
  expect(mockMenuProps.additionalOptions).toEqual([]);
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
  expect(mockMenuProps.additionalOptions).toEqual([]);

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
