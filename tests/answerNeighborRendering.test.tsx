import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentProps, ReactNode } from 'react';
import { Alert } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { type AnswerDetail, deleteAnswer, getAnswer } from '../src/api/zhihu';
import { getAllContentCollectionStatus } from '../src/api/zhihu/collection';
import { getQuestionAnswers } from '../src/api/zhihu/question';
import AnswerScreen from '../src/app/answer/[id]';
import { AnswerDetailView } from '../src/components/AnswerDetailView';
import type { CollectionButton } from '../src/components/CollectionButton';
import type { ActionSheetOption } from '../src/components/overlays/ActionSheet';
import type { RichContentLoadingPhase } from '../src/features/rich-content';
import { useAnswerDetailRead } from '../src/hooks/useAnswerDetailRead';
import {
  getAnswerEndorsementsKey,
  seedAnswerEndorsements,
} from '../src/utils/answerEndorsements';
import {
  getGuestAnswerKey,
  seedGuestAnswerFromList,
} from '../src/utils/guestAnswer';

interface ReadingOptions {
  enabled: boolean;
  contentKey: string;
  ready: boolean;
}

interface MeasurementOptions {
  enabled: boolean;
  ready: boolean;
  onContentSizeChange: (width: number, height: number) => void;
}

interface Settings {
  richContentRenderer: string;
  fontSizeScale: number;
  lineHeightScale: number;
  answerReadingMode: string;
  enableBrowseHistory: boolean;
}

interface Collections {
  setCollectedStatus: (id: string, collected: boolean) => void;
  collectedStatusMap: Record<string, boolean>;
}

interface RelationshipNoticeProps {
  contentType: 'answer' | 'pin';
  contentId: string | number;
  voteCount?: number;
  enabled?: boolean;
}

interface AnswerEndorsementsProps {
  endorsements?: unknown;
  enabled: boolean;
}

interface EndorsementSource {
  answerId: string;
  sessionVersion: number;
  endorsements: readonly unknown[];
}

const mockReadingProgress = jest.fn((_options: ReadingOptions) => ({
  beginContentMeasurement: jest.fn(),
  onContentSizeChange: jest.fn(),
  onLayout: jest.fn(),
  onScroll: jest.fn(),
  commitProgress: jest.fn(),
  restoredOffset: null,
  scrollToTop: jest.fn(),
  dismissRestoreNotice: jest.fn(),
}));
const mockReadingMeasurement = jest.fn(
  (options: MeasurementOptions) => options.onContentSizeChange,
);
const mockBodyMount = jest.fn();
const mockBodyUnmount = jest.fn();
const mockRelationshipNotice = jest.fn((_props: RelationshipNoticeProps) => {});
const mockAnswerEndorsements = jest.fn((_props: AnswerEndorsementsProps) => {});
const mockCollectionButton = jest.fn(
  (_props: ComponentProps<typeof CollectionButton>) => {},
);
let mockSessionVersion = 1;
let mockCookies = 'z_c0=synthetic-session';
let mockLayoutReady: () => void;
let mockContentLoadingPhase: RichContentLoadingPhase | null = null;
const mockPagerMount = jest.fn();
let mockScreenAnswerIds = ['84'];
let mockEntryAnswerId = '84';
let mockSelectPage: (event: { nativeEvent: { position: number } }) => void;
const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockNavigationDispatch = jest.fn();
let mockDeleteAnswerAction: (() => void) | undefined;

jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null) =>
    Boolean(cookie?.includes('z_c0=')),
}));
jest.mock('../src/api/zhihu', () => ({
  ...jest.requireActual('../src/api/zhihu/contentCollection'),
  getAnswer: jest.fn(),
  deleteAnswer: jest.fn(),
}));
jest.mock('../src/api/zhihu/question', () => ({
  getQuestionAnswers: jest.fn(),
}));
jest.mock('../src/api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../src/api/zhihu/member', () => ({
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useNavigation: () => ({
    setParams: jest.fn(),
    getState: () => ({ key: 'answer-stack' }),
    dispatch: mockNavigationDispatch,
  }),
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    id: mockEntryAnswerId,
    questionId: '7',
    answerScene: 'question_feed',
  }),
  useRouter: () => ({
    push: mockRouterPush,
    back: mockRouterBack,
    setParams: jest.fn(),
  }),
}));
jest.mock('react-native-pager-view', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: react.forwardRef(
      (
        props: {
          children: ReactNode;
          onPageSelected: typeof mockSelectPage;
        },
        ref,
      ) => {
        mockSelectPage = props.onPageSelected;
        react.useImperativeHandle(ref, () => ({
          setPageWithoutAnimation: jest.fn(),
        }));
        react.useEffect(() => mockPagerMount(), []);
        return react.createElement(native.View, null, props.children);
      },
    ),
  };
});
jest.mock('../src/components/AnswerPreviewList', () => ({
  AnswerPreviewList: () => null,
}));
jest.mock('../src/api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../src/hooks/useAnswerPagerSource', () => ({
  useAnswerPagerSource: () => ({
    data: { pages: [{ data: mockScreenAnswerIds.map((id) => ({ id })) }] },
    pagerKey: 'synthetic-question-session',
    isQuestionSource: true,
    sessionVersion: mockSessionVersion,
  }),
}));
jest.mock('../src/hooks/useNeighborAnswerPrefetch', () => ({
  useNeighborAnswerPrefetch: () => {},
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    ThemedIcon: () => null,
    useThemeColor: () => '#1364cc',
    useRuntimeThemeColors: () => ({
      shadow: '#000000',
      contentOverlayStrong: '#ffffff',
      contentBorder: '#cccccc',
    }),
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../src/components/AnswerEndorsements', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnswerEndorsements: (props: AnswerEndorsementsProps) => {
      mockAnswerEndorsements(props);
      if (!Array.isArray(props.endorsements)) return null;
      const labels = props.endorsements.flatMap((endorsement: unknown) => {
        if (!endorsement || typeof endorsement !== 'object') return [];
        const elements = (endorsement as Record<string, unknown>).elements;
        if (!Array.isArray(elements)) return [];
        return elements.flatMap((element: unknown) => {
          if (!element || typeof element !== 'object') return [];
          const value = element as Record<string, unknown>;
          return value.type === 'TEXT' && typeof value.content === 'string'
            ? [value.content]
            : [];
        });
      });
      return labels.length
        ? react.createElement(
            native.Text,
            { testID: 'answer-endorsements' },
            labels.join(' · '),
          )
        : null;
    },
  };
});
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
jest.mock('../src/components/DetailNavigationHeader', () => ({
  DetailNavigationHeader: () => null,
  useDetailNavigationHeight: () => 44,
}));
jest.mock('../src/components/DownvoteButton', () => ({
  DownvoteButton: () => null,
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
    CollectionButton: (props: ComponentProps<typeof CollectionButton>) => {
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
jest.mock('../src/components/MoreActionsButton', () => ({
  MoreActionsButton: () => null,
}));
jest.mock('../src/components/ReadingProgressNotice', () => ({
  ReadingProgressNotice: () => null,
}));
jest.mock('../src/components/ReadingScrollIndicator', () => ({
  ReadingScrollIndicator: () => null,
}));
jest.mock('../src/components/ShareMenu', () => ({
  ShareMenu: ({
    additionalOptions,
  }: {
    additionalOptions?: ActionSheetOption[];
  }) => {
    mockDeleteAnswerAction = additionalOptions?.find(
      ({ key }) => key === 'delete',
    )?.onPress;
    return null;
  },
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
}));
jest.mock('../src/components/VoterListModal', () => ({
  VoterListModal: () => null,
}));
jest.mock('../src/hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../src/hooks/useAnswerDetailRead', () => ({
  useAnswerDetailRead: jest.fn(),
  useAnswerReadSession: () => ({
    sessionVersion: mockSessionVersion,
    recorded: new Set<string>(),
  }),
}));
jest.mock('../src/hooks/useReadingProgress', () => ({
  useReadingProgress: (options: ReadingOptions) => mockReadingProgress(options),
}));
jest.mock('../src/hooks/useReadingContentMeasurement', () => ({
  useReadingContentMeasurement: (options: MeasurementOptions) =>
    mockReadingMeasurement(options),
}));
jest.mock('../src/store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: (state: { cookies: string }) => unknown) =>
    selector({ cookies: mockCookies }),
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: Settings) => unknown) =>
      selector({
        richContentRenderer: 'native-v2',
        fontSizeScale: 1,
        lineHeightScale: 1,
        answerReadingMode: 'detail',
        enableBrowseHistory: false,
      }),
    {
      getState: () => ({
        primaryColor: null,
        readingBackground: 'default',
        textContrast: 'standard',
        surfaceStyle: 'layered',
      }),
    },
  ),
}));
jest.mock('../src/store/useCollectionStore', () => ({
  useCollectionStore: (selector: (state: Collections) => unknown) =>
    selector({ setCollectedStatus: jest.fn(), collectedStatusMap: {} }),
}));
jest.mock('../src/features/rich-content', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    RICH_CONTENT_STALE_TIME: 300_000,
    isRichTextNativeAvailable: () => true,
    ZhihuContent: ({
      content,
      onLayoutReady,
      renderPlaceholder,
    }: {
      content: string;
      onLayoutReady: () => void;
      renderPlaceholder?: (phase: RichContentLoadingPhase) => ReactNode;
    }) => {
      mockLayoutReady = onLayoutReady;
      react.useEffect(() => {
        mockBodyMount();
        return () => mockBodyUnmount();
      }, []);
      if (mockContentLoadingPhase)
        return renderPlaceholder?.(mockContentLoadingPhase) ?? null;
      return react.createElement(
        native.Text,
        { testID: 'answer-body' },
        content,
      );
    },
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
      ScrollView: native.ScrollView,
      createAnimatedComponent: (component: unknown) => component,
    },
    SharedTransition: { duration: () => ({}) },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedScrollHandler: () => jest.fn(),
    // Gesture-handler's reanimated wrapper probes these two entry points.
    useEvent: () => jest.fn(),
    setGestureState: () => {},
    runOnJS: <T,>(callback: T) => callback,
  };
});
jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

const answer: AnswerDetail = {
  id: '84',
  question: { id: '7', title: '合成问题', type: 'question' },
  author: {
    id: 'synthetic-author',
    name: '合成作者',
    avatar_url: '',
    type: 'people',
  },
  content: '<p>相邻回答的合成正文</p>',
  excerpt: '相邻回答的合成正文',
  created_time: 0,
  voteup_count: 0,
  comment_count: 0,
};

const clients: QueryClient[] = [];

async function renderAnswer({
  cached = true,
  isFocused = false,
  isPreloading = true,
  cachedAnswer = answer,
  endorsementSource,
  entryEndorsements,
  activeAnswerId,
}: {
  cached?: boolean;
  isFocused?: boolean;
  isPreloading?: boolean;
  cachedAnswer?: AnswerDetail;
  endorsementSource?: EndorsementSource;
  entryEndorsements?: unknown;
  activeAnswerId?: SharedValue<string>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  clients.push(queryClient);
  seedAnswerEndorsements(queryClient, {
    id: cachedAnswer.id,
    endorsements: entryEndorsements,
  });
  if (cached)
    queryClient.setQueryData(['answer-detail', cachedAnswer.id], cachedAnswer);
  const page = (
    focused: boolean,
    preloading: boolean,
    id = String(cachedAnswer.id),
  ) => (
    <QueryClientProvider client={queryClient}>
      <AnswerDetailView
        id={id}
        endorsementSource={endorsementSource}
        isFocused={focused}
        isPreloading={preloading}
        activeAnswerId={activeAnswerId}
      />
    </QueryClientProvider>
  );
  const host = await render(page(isFocused, isPreloading));
  return { ...host, queryClient, page };
}

function expectInactiveReading() {
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ contentKey: 'answer:84', enabled: false }),
  );
  expect(mockReadingMeasurement).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockSessionVersion = 1;
  mockCookies = 'z_c0=synthetic-session';
  mockContentLoadingPhase = null;
  mockScreenAnswerIds = ['84'];
  mockEntryAnswerId = '84';
  mockDeleteAnswerAction = undefined;
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [] });
  jest.mocked(getAnswer).mockResolvedValue(answer);
  jest
    .mocked(getAllContentCollectionStatus)
    .mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
  onlineManager.setOnline(true);
  jest.restoreAllMocks();
});

function deferAnswerDeletion() {
  let finish!: () => void;
  jest.mocked(deleteAnswer).mockReturnValueOnce(
    new Promise<Awaited<ReturnType<typeof deleteAnswer>>>((resolve) => {
      finish = () => resolve({ success: true });
    }),
  );
  return () => finish();
}

async function confirmAnswerDeletion() {
  await act(() => mockDeleteAnswerAction?.());
  const confirm = jest
    .mocked(Alert.alert)
    .mock.calls.at(-1)?.[2]
    ?.find(({ text }) => text === '确认删除');
  expect(confirm?.onPress).toBeDefined();
  await act(() => confirm?.onPress?.());
  await waitFor(() => expect(deleteAnswer).toHaveBeenCalledWith('84'));
}

test('a delayed deletion targets its original answer even when a newer list hides the page', async () => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const finish = deferAnswerDeletion();
  const host = await renderAnswer({
    isFocused: true,
    cachedAnswer: { ...answer, relationship: { is_author: true } },
  });
  await confirmAnswerDeletion();
  await host.rerender(host.page(false, false));
  await act(() => finish());
  await waitFor(() =>
    expect(mockNavigationDispatch).toHaveBeenCalledWith({
      type: 'GO_BACK',
      target: 'answer-stack',
    }),
  );
  expect(mockNavigationDispatch).toHaveBeenCalledTimes(1);
  expect(mockRouterBack).not.toHaveBeenCalled();
});

test.each(['answer', 'pager', 'session', 'unmount'] as const)(
  'a delayed deletion cannot close newer content after %s changes',
  async (change) => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const finish = deferAnswerDeletion();
    const activeAnswerId = { value: '84' } as SharedValue<string>;
    const host = await renderAnswer({
      isFocused: true,
      activeAnswerId,
      cachedAnswer: { ...answer, relationship: { is_author: true } },
    });
    await confirmAnswerDeletion();
    if (change === 'answer') await host.rerender(host.page(true, true, '85'));
    else if (change === 'pager') activeAnswerId.value = '85';
    else if (change === 'session') mockSessionVersion += 1;
    else await host.unmount();
    await act(() => finish());
    await waitFor(() => expect(host.queryClient.isMutating()).toBe(0));
    expect(mockNavigationDispatch).not.toHaveBeenCalled();
    expect(mockRouterBack).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith('删除成功', expect.anything());
  },
);

test('shows a waiting placeholder only after an offline answer becomes active and loads it on reconnect', async () => {
  onlineManager.setOnline(false);
  const host = await renderAnswer({ cached: false, isFocused: false });
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(getAnswer).not.toHaveBeenCalled();

  await host.rerender(host.page(true, true));
  expect(
    host.queryClient.getQueryState(['answer-detail', answer.id])?.fetchStatus,
  ).toBe('paused');
  expect(host.getByText('正在获取回答…')).toBeOnTheScreen();
  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(host.queryByText(/可能已被删除/)).toBeNull();
  expect(getAnswer).not.toHaveBeenCalled();

  await act(() => onlineManager.setOnline(true));
  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content),
  );
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(getAnswer).toHaveBeenCalledTimes(1);
  await host.unmount();
});

test('keeps cached answer content visible when its background refresh is paused offline', async () => {
  onlineManager.setOnline(false);
  const host = await renderAnswer({ isFocused: true });
  await act(async () => {
    await host.queryClient.invalidateQueries({
      queryKey: ['answer-detail', answer.id],
      exact: true,
    });
  });

  expect(
    host.queryClient.getQueryState(['answer-detail', answer.id])?.fetchStatus,
  ).toBe('paused');
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(getAnswer).not.toHaveBeenCalled();
  await host.unmount();
});

test('mounts a cached neighboring body before focus without starting detail, collection, relationship, or reading work', async () => {
  const host = await renderAnswer();

  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: answer.id,
      type: 'answer',
      disabled: true,
    }),
  );
  expect(host.getByRole('button', { name: '收藏' })).toBeDisabled();
  expect(mockRelationshipNotice).toHaveBeenLastCalledWith({
    contentType: 'answer',
    contentId: answer.id,
    voteCount: answer.voteup_count,
    enabled: false,
  });
  expect(
    host
      .getAllByTestId(/^(content-relationship-notice|answer-body)$/)
      .map((node) => node.props.testID),
  ).toEqual(['content-relationship-notice', 'answer-body']);
  expectInactiveReading();
});

test('reports only the focused answer after its body layout is ready', async () => {
  const host = await renderAnswer();
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    false,
    undefined,
  );
  await act(() => mockLayoutReady());
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    false,
    undefined,
  );
  await host.rerender(host.page(true, true));
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    true,
    undefined,
  );
  await host.rerender(host.page(false, true));
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    false,
    undefined,
  );
});

test('a selected answer does not report while fetching or waiting for native layout', async () => {
  let finish!: (value: AnswerDetail) => void;
  jest.mocked(getAnswer).mockReturnValueOnce(
    new Promise<AnswerDetail>((resolve) => {
      finish = resolve;
    }),
  );
  const host = await renderAnswer({ cached: false, isFocused: true });
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    undefined,
    false,
    undefined,
  );
  await act(() => finish(answer));
  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toBeOnTheScreen(),
  );
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    false,
    undefined,
  );
  await act(() => mockLayoutReady());
  expect(useAnswerDetailRead).toHaveBeenLastCalledWith(
    '84',
    '7',
    true,
    undefined,
  );
});

test('an active answer enables collection immediately before comments using its collection state', async () => {
  const cachedAnswer = {
    ...answer,
    favlists_count: 123,
    relationship: { ...answer.relationship, is_favorited: true },
  };
  const host = await renderAnswer({ cachedAnswer, isFocused: true });
  expect(mockCollectionButton).toHaveBeenLastCalledWith(
    expect.objectContaining({
      id: answer.id,
      type: 'answer',
      isCollected: true,
      count: 123,
      countDisplay: 'corner',
      disabled: false,
    }),
  );
  expect(host.getByRole('button', { name: '收藏' })).toBeEnabled();
  expect(
    host
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel)
      .filter((label) => label === '收藏' || label === '评论'),
  ).toEqual(['收藏', '评论']);
});

test('shows the comment count in the action and exposes the full count', async () => {
  const host = await renderAnswer({
    cachedAnswer: { ...answer, comment_count: 12345 },
    isFocused: true,
  });
  const button = host.getByRole('button', { name: '评论' });
  expect(button).toHaveProp('accessibilityValue', { text: '12345 条评论' });
  expect(host.getByText('1.2万')).toBeTruthy();
});

test('shows cached answer endorsements above relationship and body while disabling inactive actions', async () => {
  const endorsements = [
    { elements: [{ type: 'TEXT', content: '合成日报收录' }] },
    {
      action_url: 'https://www.zhihu.com/column/synthetic-column',
      elements: [
        { type: 'IMAGE', image_key: 'synthetic-column-icon' },
        { type: 'TEXT', content: '收录于 · 合成专栏' },
      ],
    },
  ];
  const cachedAnswer: AnswerDetail = { ...answer, endorsements };
  const host = await renderAnswer({ cachedAnswer });

  expect(mockAnswerEndorsements).toHaveBeenLastCalledWith({
    endorsements,
    enabled: false,
  });
  expect(host.getByTestId('answer-endorsements')).toHaveTextContent(
    '合成日报收录 · 收录于 · 合成专栏',
  );
  expect(
    host
      .getAllByTestId(
        /^(answer-endorsements|content-relationship-notice|answer-body)$/,
      )
      .map((node) => node.props.testID),
  ).toEqual([
    'answer-endorsements',
    'content-relationship-notice',
    'answer-body',
  ]);
  expect(getAnswer).not.toHaveBeenCalled();

  await host.rerender(host.page(true, true));
  expect(mockAnswerEndorsements).toHaveBeenLastCalledWith({
    endorsements,
    enabled: true,
  });
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
});

test('uses matching pager endorsement metadata when the loaded detail omits it', async () => {
  const endorsements = [
    { elements: [{ type: 'TEXT', content: '合成分页回答标签' }] },
  ];
  const host = await renderAnswer({
    isFocused: true,
    entryEndorsements: [
      { elements: [{ type: 'TEXT', content: '合成旧入口标签' }] },
    ],
    endorsementSource: {
      answerId: String(answer.id),
      sessionVersion: mockSessionVersion,
      endorsements,
    },
  });

  expect(mockAnswerEndorsements).toHaveBeenLastCalledWith({
    endorsements,
    enabled: true,
  });
  expect(host.getByTestId('answer-endorsements')).toHaveTextContent(
    '合成分页回答标签',
  );
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
});

test('shows clicked metadata after fetching a body without needing a matching pager entry', async () => {
  const endorsements = [
    { elements: [{ type: 'TEXT', content: '合成无正文入口标签' }] },
  ];
  let finishRequest!: (value: AnswerDetail) => void;
  jest.mocked(getAnswer).mockReturnValue(
    new Promise<AnswerDetail>((resolve) => {
      finishRequest = resolve;
    }),
  );
  const host = await renderAnswer({
    cached: false,
    isFocused: true,
    entryEndorsements: endorsements,
  });
  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(
    host.queryClient.getQueryData(['answer-detail', answer.id]),
  ).toBeUndefined();
  expect(
    host.queryClient.getQueryData(
      getAnswerEndorsementsKey(String(answer.id), mockSessionVersion),
    ),
  ).toBe(endorsements);

  await act(() => finishRequest(answer));
  await waitFor(() =>
    expect(host.getByTestId('answer-endorsements')).toHaveTextContent(
      '合成无正文入口标签',
    ),
  );
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(getAnswer).toHaveBeenCalledTimes(1);

  mockSessionVersion += 1;
  await host.rerender(host.page(true, true));
  expect(host.queryByTestId('answer-endorsements')).toBeNull();
  await act(() => {
    seedAnswerEndorsements(host.queryClient, {
      id: answer.id,
      endorsements: [],
    });
  });
  await waitFor(() =>
    expect(mockAnswerEndorsements).toHaveBeenLastCalledWith({
      endorsements: [],
      enabled: true,
    }),
  );
  expect(getAnswer).toHaveBeenCalledTimes(1);
});

test.each([
  { label: 'an explicit empty detail list', detailEndorsements: [] },
  {
    label: 'the returned detail list',
    detailEndorsements: [
      { elements: [{ type: 'TEXT', content: '合成详情接口标签' }] },
    ],
  },
])('prefers $label over pager metadata', async ({ detailEndorsements }) => {
  const host = await renderAnswer({
    isFocused: true,
    entryEndorsements: [
      { elements: [{ type: 'TEXT', content: '合成过时入口标签' }] },
    ],
    cachedAnswer: { ...answer, endorsements: detailEndorsements },
    endorsementSource: {
      answerId: String(answer.id),
      sessionVersion: mockSessionVersion,
      endorsements: [
        { elements: [{ type: 'TEXT', content: '合成过时分页标签' }] },
      ],
    },
  });

  expect(mockAnswerEndorsements).toHaveBeenLastCalledWith({
    endorsements: detailEndorsements,
    enabled: true,
  });
  expect(host.queryByText('合成过时分页标签')).toBeNull();
  if (detailEndorsements.length === 0)
    expect(host.queryByTestId('answer-endorsements')).toBeNull();
  else
    expect(host.getByTestId('answer-endorsements')).toHaveTextContent(
      '合成详情接口标签',
    );
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
});

test.each<readonly [RichContentLoadingPhase, string]>([
  ['container-layout', '正在确认正文宽度…'],
  ['text-layout', '正在排版文字…'],
  ['content-layout', '正在布局正文内容…'],
])(
  'reports %s for a cached answer without claiming to fetch its body',
  async (phase, message) => {
    mockContentLoadingPhase = phase;
    const host = await renderAnswer({ isFocused: true });

    expect(host.queryByText(message)).toBeNull();
    await waitFor(() => expect(host.getByText(message)).toBeTruthy());
    expect(host.queryByText('正在获取回答…')).toBeNull();
    expect(getAnswer).not.toHaveBeenCalled();
    expect(host.queryByTestId('answer-body')).toBeNull();

    mockContentLoadingPhase = null;
    await host.rerender(host.page(true, true));

    expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
    expect(host.queryByText(message)).toBeNull();
    expect(host.queryByText('正在获取回答…')).toBeNull();
  },
);

test('keeps a cached answer in its layout phase during a background refresh', async () => {
  let finishRequest!: (value: AnswerDetail) => void;
  jest.mocked(getAnswer).mockReturnValue(
    new Promise<AnswerDetail>((resolve) => {
      finishRequest = resolve;
    }),
  );
  mockContentLoadingPhase = 'text-layout';
  const host = await renderAnswer({ isFocused: true });
  expect(getAnswer).not.toHaveBeenCalled();
  await waitFor(() => expect(host.getByText('正在排版文字…')).toBeTruthy());

  await act(() => {
    void host.queryClient.invalidateQueries({
      queryKey: ['answer-detail', answer.id],
      exact: true,
    });
  });
  await waitFor(() => expect(getAnswer).toHaveBeenCalledTimes(1));
  expect(
    host.queryClient.getQueryState(['answer-detail', answer.id])?.fetchStatus,
  ).toBe('fetching');
  expect(host.getByText('正在排版文字…')).toBeTruthy();
  expect(host.queryByText('正在获取回答…')).toBeNull();

  await act(() => finishRequest(answer));
  await waitFor(() =>
    expect(
      host.queryClient.getQueryState(['answer-detail', answer.id])?.fetchStatus,
    ).toBe('idle'),
  );
  expect(host.getByText('正在排版文字…')).toBeTruthy();
  expect(host.queryByText('正在获取回答…')).toBeNull();
});

test('changes an uncached focused answer from fetching to its actual native layout phase', async () => {
  let finishRequest!: (value: AnswerDetail) => void;
  jest.mocked(getAnswer).mockReturnValue(
    new Promise<AnswerDetail>((resolve) => {
      finishRequest = resolve;
    }),
  );
  mockContentLoadingPhase = 'container-layout';
  const host = await renderAnswer({ cached: false, isFocused: true });

  expect(host.getByText('正在获取回答…')).toBeTruthy();
  expect(host.queryByText('正在确认正文宽度…')).toBeNull();
  expect(mockBodyMount).not.toHaveBeenCalled();
  expect(mockRelationshipNotice).not.toHaveBeenCalled();
  expect(getAnswer).toHaveBeenCalledTimes(1);

  await act(() => finishRequest(answer));
  await waitFor(() => expect(host.getByText('正在确认正文宽度…')).toBeTruthy());
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(mockRelationshipNotice).toHaveBeenLastCalledWith(
    expect.objectContaining({ contentId: answer.id, enabled: true }),
  );

  mockContentLoadingPhase = 'text-layout';
  await host.rerender(host.page(true, true));
  expect(host.getByText('正在排版文字…')).toBeTruthy();
  expect(host.queryByText('正在确认正文宽度…')).toBeNull();
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(getAnswer).toHaveBeenCalledTimes(1);
});

test.each([401, 403])(
  'keeps a failed initial answer mounted after HTTP %s and recovers only on explicit retry',
  async (status) => {
    let rejectRequest!: (error: unknown) => void;
    jest
      .mocked(getAnswer)
      .mockReturnValue(new Promise(() => {}))
      .mockReturnValueOnce(
        new Promise<AnswerDetail>((_resolve, reject) => {
          rejectRequest = reject;
        }),
      );
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    clients.push(queryClient);
    const host = await render(
      <QueryClientProvider client={queryClient}>
        <AnswerScreen />
      </QueryClientProvider>,
    );
    expect(host.getByText('正在获取回答…')).toBeOnTheScreen();

    await act(() =>
      rejectRequest(
        Object.assign(new Error('Synthetic request failure'), {
          isAxiosError: true,
          response: { status },
        }),
      ),
    );

    await waitFor(() =>
      expect(host.getByText('回答加载失败')).toBeOnTheScreen(),
    );
    expect(host.queryByText('正在获取回答…')).toBeNull();
    expect(getAnswer).toHaveBeenCalledTimes(1);
    expect(mockPagerMount).toHaveBeenCalledTimes(1);

    jest.mocked(getAnswer).mockResolvedValue(answer);
    await fireEvent.press(host.getByRole('button', { name: '重新加载' }));

    await waitFor(() =>
      expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content),
    );
    expect(host.queryByText('回答加载失败')).toBeNull();
    expect(getAnswer).toHaveBeenCalledTimes(2);
    expect(mockPagerMount).toHaveBeenCalledTimes(1);
  },
);

test('allows paging to another answer when the initial answer cannot be fetched', async () => {
  mockScreenAnswerIds = ['84', '85'];
  jest.mocked(getAnswer).mockImplementation(async (id) => {
    if (String(id) === '84')
      throw Object.assign(new Error('Synthetic request failure'), {
        isAxiosError: true,
        response: { status: 403 },
      });
    return { ...answer, id, content: '<p>另一个可读取的回答</p>' };
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(queryClient);
  const host = await render(
    <QueryClientProvider client={queryClient}>
      <AnswerScreen />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(host.getByText('回答加载失败')).toBeOnTheScreen());

  await act(() => mockSelectPage({ nativeEvent: { position: 1 } }));

  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toHaveTextContent(
      '<p>另一个可读取的回答</p>',
    ),
  );
  expect(jest.mocked(getAnswer).mock.calls.map(([id]) => id)).toEqual([
    '84',
    '85',
  ]);
  expect(mockPagerMount).toHaveBeenCalledTimes(1);
});

test.each<Partial<AnswerDetail>>([
  { id: '84', content_need_truncated: true },
  { id: '85', answer_type: 'PAID' },
  { id: '86', paid_info: {} },
])(
  'shows guest content with a working login action for answer $id',
  async (overrides) => {
    mockCookies = '';
    const guestAnswer: AnswerDetail = { ...answer, ...overrides };
    mockEntryAnswerId = String(guestAnswer.id);
    mockScreenAnswerIds = [mockEntryAnswerId];
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    clients.push(queryClient);
    seedGuestAnswerFromList(queryClient, guestAnswer, mockSessionVersion);
    const host = await render(
      <QueryClientProvider client={queryClient}>
        <AnswerScreen />
      </QueryClientProvider>,
    );

    expect(host.getByTestId('answer-body')).toHaveTextContent(
      guestAnswer.content,
    );
    expect(host.getByText('当前仅展示游客可见的部分正文')).toBeOnTheScreen();
    expect(host.queryByText('正在获取回答…')).toBeNull();
    expect(getAnswer).not.toHaveBeenCalled();
    expect(getQuestionAnswers).not.toHaveBeenCalled();
    expect(
      queryClient.getQueryData(
        getGuestAnswerKey(mockEntryAnswerId, mockSessionVersion),
      ),
    ).toEqual(guestAnswer);
    expect(
      queryClient.getQueryData(['answer-detail', mockEntryAnswerId]),
    ).toBeUndefined();

    await fireEvent.press(host.getByRole('button', { name: '登录后查看回答' }));
    expect(mockRouterPush).toHaveBeenCalledWith('/login');
    expect(mockPagerMount).toHaveBeenCalledTimes(1);
  },
);

test('fetches an uncached guest answer once from its public question cards', async () => {
  mockCookies = '';
  jest.mocked(getQuestionAnswers).mockResolvedValue({ data: [answer] });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(queryClient);
  const host = await render(
    <QueryClientProvider client={queryClient}>
      <AnswerScreen />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content),
  );
  expect(getQuestionAnswers).toHaveBeenCalledTimes(1);
  expect(getQuestionAnswers).toHaveBeenCalledWith('7', 0, 'default', '', {
    signal: expect.any(AbortSignal),
  });
  expect(getAnswer).not.toHaveBeenCalled();
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(host.queryByText('当前仅展示游客可见的部分正文')).toBeNull();
});

test('settles on a stable message when public question cards do not contain the guest answer', async () => {
  mockCookies = '';
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(queryClient);
  const host = await render(
    <QueryClientProvider client={queryClient}>
      <AnswerScreen />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(
      host.getByText('游客暂时无法获取该回答，请登录后重试'),
    ).toBeOnTheScreen(),
  );
  expect(host.queryByText('正在获取回答…')).toBeNull();
  expect(getQuestionAnswers).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(mockPagerMount).toHaveBeenCalledTimes(1);
});

test('replaces a signed-in answer with the new guest session content after switching modes', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(queryClient);
  const signedInAnswer = { ...answer, content: '<p>登录态完整正文</p>' };
  queryClient.setQueryData(['answer-detail', answer.id], signedInAnswer);
  const screen = () => (
    <QueryClientProvider client={queryClient}>
      <AnswerScreen />
    </QueryClientProvider>
  );
  const host = await render(screen());
  expect(host.getByTestId('answer-body')).toHaveTextContent(
    signedInAnswer.content,
  );

  mockCookies = '';
  mockSessionVersion += 1;
  const guestAnswer = {
    ...answer,
    content: '<p>新游客会话可以读取的部分</p>',
    content_need_truncated: true,
  };
  seedGuestAnswerFromList(queryClient, guestAnswer, mockSessionVersion);
  await host.rerender(screen());

  expect(host.getByTestId('answer-body')).toHaveTextContent(
    guestAnswer.content,
  );
  expect(host.queryByText(signedInAnswer.content)).toBeNull();
  expect(host.getByText('当前仅展示游客可见的部分正文')).toBeOnTheScreen();
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getQuestionAnswers).not.toHaveBeenCalled();
  expect(queryClient.getQueryData(['answer-detail', answer.id])).toEqual(
    signedInAnswer,
  );
});

test('keeps an uncached neighbor blank and mounts its body when prefetch populates the disabled query', async () => {
  const host = await renderAnswer({ cached: false });

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyMount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();

  await act(() => {
    host.queryClient.setQueryData(['answer-detail', answer.id], answer);
  });
  await waitFor(() =>
    expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content),
  );

  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('leaves an unvisited page outside the neighboring window blank even when it has cached data', async () => {
  const host = await renderAnswer({ isPreloading: false });

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyMount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('unmounts an unvisited preloaded body when it leaves the neighboring window', async () => {
  const host = await renderAnswer();
  expect(host.getByTestId('answer-body')).toBeTruthy();

  await host.rerender(host.page(false, false));

  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockBodyUnmount).toHaveBeenCalledTimes(1);
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('retains a visited body when focus and neighboring preload end while disabling reading work', async () => {
  const host = await renderAnswer();
  await host.rerender(host.page(true, true));
  await waitFor(() =>
    expect(getAllContentCollectionStatus).toHaveBeenCalledTimes(1),
  );
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );
  expect(mockReadingMeasurement).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true }),
  );

  await host.rerender(host.page(false, false));

  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(mockBodyUnmount).not.toHaveBeenCalled();
  expect(getAnswer).not.toHaveBeenCalled();
  expectInactiveReading();
});

test('preserves native layout readiness when a preloaded body becomes focused', async () => {
  const host = await renderAnswer();
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: false }),
  );
  await act(() => mockLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );

  await host.rerender(host.page(true, true));

  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true, ready: true }),
  );
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(mockBodyUnmount).not.toHaveBeenCalled();
});

test('requires a fresh native layout after an unvisited body leaves and reenters the preload window', async () => {
  const host = await renderAnswer();
  const oldLayoutReady = mockLayoutReady;
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: true }),
  );

  await host.rerender(host.page(false, false));
  expect(host.queryByTestId('answer-body')).toBeNull();
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );
  await host.rerender(host.page(false, true));
  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(2);
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );

  const newLayoutReady = mockLayoutReady;
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ ready: false }),
  );
  await act(() => newLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );
  await act(() => oldLayoutReady());
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: false, ready: true }),
  );
  await host.rerender(host.page(true, true));
  expect(mockReadingProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({ enabled: true, ready: true }),
  );
});
