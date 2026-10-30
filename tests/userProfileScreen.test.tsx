import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, Animated, StyleSheet } from 'react-native';
import {
  type FeedItem,
  getMemberActivities,
  getMemberRelations,
  getMemberWithFallback,
  searchContent,
} from '../src/api/zhihu';
import {
  getMemberAnswersVotedByMe,
  getMemberColumnContributions,
  getRecentMemberActivities,
  type ZhihuMember,
} from '../src/api/zhihu/member';
import { fetchMemberCreations } from '../src/api/zhihu/moments';
import UserDetailScreen from '../src/app/user/[id]/index';
import type { ProfileTabListProps } from '../src/components/profile/ProfileTabList';
import { PaneContext } from '../src/features/adaptive-layout/PaneContext';
import type { AnswerReadingContext } from '../src/utils/answerReadingContext';

interface MockPagerProps extends PropsWithChildren {
  initialPage: number;
  scrollEnabled?: boolean;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged: (event: {
    nativeEvent: { pageScrollState: string };
  }) => void;
}

let mockPagerProps: MockPagerProps;
const mockSetPage = jest.fn();
const mockPush = jest.fn();
const mockScrollToOffset = jest.fn();
const mockPagerMount = jest.fn();
const mockPagerUnmount = jest.fn();
const mockListMount = jest.fn();
const mockListUnmount = jest.fn();
const mockListProps = new Map<string, ProfileTabListProps>();
const mockFeedItems = new Map<string, FeedItem>();
const mockFeedContexts = new Map<string, AnswerReadingContext | undefined>();
const mockProfileHeader = jest.fn();
const member: ZhihuMember = {
  id: 'member-hash-id',
  url_token: 'member-readable-token',
  name: '合成作者',
  type: 'people',
  avatar_url: '',
};
let mockRoute: {
  id: string;
  tab?: string;
  name?: string | string[];
  avatar?: string | string[];
  headline?: string | string[];
};
let mockAuthState: { cookies: string; me: ZhihuMember | null };
let mockSessionVersion: number;

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockRoute,
  useRouter: () => ({
    push: mockPush,
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('../src/api/zhihu', () => ({
  getMe: jest.fn(),
  getMemberWithFallback: jest.fn(),
  getMemberActivities: jest.fn(),
  getMemberRelations: jest.fn(),
  searchContent: jest.fn(),
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
  getContentVoteCount: () => 0,
  getContentCollectionMetadata: jest.requireActual<
    typeof import('../src/api/zhihu/contentCollection')
  >('../src/api/zhihu/contentCollection').getContentCollectionMetadata,
  getContentVoteState: (
    _type: string,
    item: { relationship?: { voting?: number } },
  ) => item.relationship?.voting ?? 0,
  MEMBER_ANSWERS_INCLUDE: 'synthetic-answer-fields',
}));
jest.mock('../src/api/zhihu/member', () => ({
  getMemberAnswersVotedByMe: jest.fn(),
  getMemberColumnContributions: jest.fn(),
  getRecentMemberActivities: jest.fn(),
}));
jest.mock('../src/api/zhihu/moments', () => ({
  fetchMemberCreations: jest.fn(),
}));
jest.mock('../src/api/zhihu/history', () => ({ addReadHistory: jest.fn() }));
jest.mock('../src/api/client', () => ({
  hasAuthenticationCookie: (cookie: string | null | undefined) =>
    typeof cookie === 'string' && /(?:^|;\s*)z_c0=[^;\s]+/.test(cookie),
}));
jest.mock('../src/store/useAuthStore', () => ({
  useAuthStore: (selector?: (state: typeof mockAuthState) => unknown) =>
    selector ? selector(mockAuthState) : mockAuthState,
  getAuthSessionVersion: () => mockSessionVersion,
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: null,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    enableBrowseHistory: false,
    enableParallelPaging: false,
  })),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 24, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/components/Themed', () => {
  const native = jest.requireActual('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/StableAvatar', () => ({
  StableAvatar: () => null,
}));
jest.mock('../src/components/profile/ProfileCover', () => ({
  ProfileToolbarBackground: () => null,
}));
jest.mock('../src/components/profile/ProfileHeader', () => ({
  ProfileHeader: (props: {
    isMe: boolean;
    isLoading?: boolean;
    user: ZhihuMember;
  }) => {
    mockProfileHeader(props);
    return jest
      .requireActual('react')
      .createElement(
        jest.requireActual('react-native').Text,
        { testID: 'profile-owner' },
        props.isMe ? '自己的主页' : '其他人的主页',
      );
  },
}));
jest.mock('../src/components/FeedCard', () => ({
  FeedCard: ({
    item,
    answerContext,
  }: {
    item: FeedItem;
    answerContext?: AnswerReadingContext;
  }) => {
    mockFeedItems.set(item.id, item);
    mockFeedContexts.set(`${item.type}:${item.id}`, answerContext);
    return jest
      .requireActual('react')
      .createElement(jest.requireActual('react-native').Text, null, item.title);
  },
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: {
      View: jest.requireActual('react-native').View,
      createAnimatedComponent: (component: unknown) => component,
    },
    useSharedValue: (value: unknown) => react.useRef({ value }).current,
    useDerivedValue: (factory: () => unknown) => ({ value: factory() }),
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useAnimatedReaction: () => undefined,
    useEvent: (callback: unknown) => callback,
    interpolate: () => 0,
    runOnJS: (callback: unknown) => callback,
  };
});
jest.mock('react-native-pager-view', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: react.forwardRef((props: MockPagerProps, ref) => {
      mockPagerProps = props;
      react.useImperativeHandle(ref, () => ({ setPage: mockSetPage }));
      react.useEffect(() => {
        mockPagerMount();
        return () => mockPagerUnmount();
      }, []);
      return react.createElement(
        jest.requireActual('react-native').View,
        { testID: 'native-profile-pager' },
        props.children,
      );
    }),
  };
});
jest.mock('../src/components/profile/ProfileTabList', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    ProfileTabList: react.forwardRef((props: ProfileTabListProps, ref) => {
      mockListProps.set(props.label, props);
      react.useImperativeHandle(ref, () => ({
        scrollToOffset: mockScrollToOffset,
      }));
      react.useEffect(() => {
        mockListMount(props.label);
        return () => mockListUnmount(props.label);
      }, [props.label]);
      return react.createElement(
        jest.requireActual('react-native').View,
        { testID: `profile-list-${props.label}` },
        props.listHeader,
        props.query.data.length === 0 &&
          !props.query.isLoading &&
          !props.query.isError
          ? props.emptyState
          : null,
        props.query.data.map((item) =>
          react.createElement(
            react.Fragment,
            { key: props.keyExtractor(item) },
            props.renderItem(item),
          ),
        ),
      );
    }),
  };
});

let client: QueryClient;
const emptyPage = {
  data: [],
  paging: { is_end: true, is_start: true, next: '', previous: '', totals: 0 },
};
const votedAnswer = {
  id: 'voted-answer-id',
  type: 'answer' as const,
  author: {
    id: member.id,
    url_token: member.url_token,
    name: member.name,
    avatar_url: 'https://example.com/answer-author.jpg',
    headline: '回答作者签名',
    type: 'people' as const,
  },
  question: {
    id: 'voted-question-id',
    title: '我赞同过的回答所属问题',
    type: 'question' as const,
  },
  excerpt: '合成回答摘要',
  content: '<p>合成回答正文</p>',
  comment_count: 3,
  favlists_count: 5,
  voteup_count: 12,
  created_time: 1,
  updated_time: 2,
  relationship: { voting: 1, is_favorited: true },
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  mockListProps.clear();
  mockFeedItems.clear();
  mockFeedContexts.clear();
  mockRoute = { id: 'member-readable-token' };
  mockAuthState = { cookies: 'z_c0=synthetic-session', me: member };
  mockSessionVersion = 1;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
  client.setQueryData(['user-detail', mockRoute.id], member);
  client.setQueryData(['me'], member);
  jest.mocked(getMemberWithFallback).mockResolvedValue(member);
  jest.mocked(getMemberActivities).mockResolvedValue(emptyPage);
  jest.mocked(getMemberRelations).mockResolvedValue(emptyPage);
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValue(emptyPage);
  jest.mocked(getMemberColumnContributions).mockResolvedValue(emptyPage);
  jest.mocked(searchContent).mockResolvedValue(emptyPage);
  jest.mocked(fetchMemberCreations).mockResolvedValue(emptyPage);
  jest.mocked(getRecentMemberActivities).mockResolvedValue({
    ...emptyPage,
    data: [
      {
        id: 'creation-event',
        target: {
          id: 'creation-answer',
          type: 'answer',
          question: { id: 'question-id', title: '最近更新的创作' },
        },
      },
    ],
  });
});
afterEach(async () => {
  await act(async () => {
    await jest.runOnlyPendingTimersAsync();
  });
  client.clear();
  jest.useRealTimers();
});

/** A synthetic 创作 entry: the content the member's own list would return. */
function creationCard(
  contentType: 'answer' | 'article' | 'pin',
  id: string,
  title: string,
  authorId = member.id,
) {
  const author = { ...member, id: authorId, url_token: `${authorId}-token` };
  return {
    type: 'moments_feed',
    target:
      contentType === 'answer'
        ? { id, type: 'answer', author, question: { id: `q-${id}`, title } }
        : { id, type: contentType, author, title },
  };
}

/** Serve one page of 创作 cards. */
function mockCreations(cards: ReturnType<typeof creationCard>[]) {
  jest.mocked(fetchMemberCreations).mockResolvedValue({
    data: cards,
    paging: { is_end: true, next: '' },
  });
}

const screen = () => (
  <QueryClientProvider client={client}>
    <UserDetailScreen />
  </QueryClientProvider>
);

async function flushQueries(duration = 1) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(duration);
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1);
  });
}

test('profile entry motion affects its content while the back control stays fixed and usable', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  const progress = new Animated.Value(0.5);
  const host = await render(
    <PaneContext.Provider
      value={{
        width: 390,
        height: 844,
        visible: true,
        profileEntryProgress: progress,
      }}
    >
      {screen()}
    </PaneContext.Provider>,
  );
  await flushQueries();
  const content = host.getByTestId('profile-entry-content');
  expect(within(content).getByTestId('profile-owner')).toBeVisible();
  expect(StyleSheet.flatten(content.props.style).transform).toBeDefined();
  expect(StyleSheet.flatten(content.props.style).transformOrigin).toBe(
    '50% 0%',
  );
  const background = host.getByTestId('profile-entry-toolbar-background');
  expect(StyleSheet.flatten(background.props.style).transform).toEqual(
    StyleSheet.flatten(content.props.style).transform,
  );
  expect(StyleSheet.flatten(background.props.style).opacity).toEqual(
    StyleSheet.flatten(content.props.style).opacity,
  );
  expect(timing).not.toHaveBeenCalled();
  expect(within(content).queryByLabelText('返回')).toBeNull();
  expect(host.getByLabelText('返回')).toBeEnabled();
  await host.unmount();
  timing.mockRestore();
});

test('a transient zero toolbar measurement does not shift the profile header', async () => {
  const host = await render(screen());
  await flushQueries();
  const previousInset = mockProfileHeader.mock.calls.at(-1)?.[0].topInset;
  await fireEvent(host.getByTestId('profile-toolbar-row'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 0 } },
  });
  expect(mockProfileHeader.mock.calls.at(-1)?.[0].topInset).toBe(previousInset);
  await fireEvent(host.getByTestId('profile-toolbar-row'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 80 } },
  });
  expect(mockProfileHeader.mock.calls.at(-1)?.[0].topInset).toBe(124);
  await host.unmount();
});

test('profile opens from the card before a slow request and does not replay when data arrives', async () => {
  client.removeQueries({ queryKey: ['user-detail', mockRoute.id] });
  mockRoute.name = '卡片作者';
  mockRoute.avatar = 'https://example.com/synthetic-avatar.jpg';
  mockRoute.headline = '卡片简介';
  let finish: ((value: ZhihuMember) => void) | undefined;
  jest.mocked(getMemberWithFallback).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const progress = new Animated.Value(0.5);
    const host = await render(
      <PaneContext.Provider
        value={{
          width: 390,
          height: 844,
          visible: true,
          profileEntryProgress: progress,
        }}
      >
        {screen()}
      </PaneContext.Provider>,
    );
    await flushQueries();
    expect(host.getByTestId('profile-entry-content')).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
    expect(mockProfileHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isLoading: true,
        user: expect.objectContaining({
          name: '卡片作者',
          avatar_url: 'https://example.com/synthetic-avatar.jpg',
          headline: '卡片简介',
        }),
      }),
    );
    expect(mockListProps.get('创作')?.hideInitialLoadingIndicator).toBe(true);
    timing.mockClear();
    await act(async () => {
      finish?.(member);
    });
    await flushQueries();
    expect(host.getByTestId('profile-entry-content')).toBeTruthy();
    expect(timing).not.toHaveBeenCalled();
    expect(mockProfileHeader).toHaveBeenLastCalledWith(
      expect.objectContaining({ isLoading: false, user: member }),
    );
    expect(mockListProps.get('创作')?.hideInitialLoadingIndicator).toBe(false);
    timing.mockClear();
    await act(() =>
      client.setQueryData(['user-detail', mockRoute.id], {
        ...member,
        headline: '新简介',
      }),
    );
    expect(timing).not.toHaveBeenCalled();
    await host.unmount();
  } finally {
    timing.mockRestore();
  }
});

test('repeated profile identity parameters use the first value while loading and after the response', async () => {
  client.removeQueries({ queryKey: ['user-detail', mockRoute.id] });
  mockRoute.name = ['卡片作者', '其他作者'];
  mockRoute.avatar = [
    'https://example.com/avatar.jpg',
    'https://example.com/other.jpg',
  ];
  mockRoute.headline = ['卡片简介', '其他简介'];
  let finish: ((value: ZhihuMember) => void) | undefined;
  jest.mocked(getMemberWithFallback).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const host = await render(screen());
  await flushQueries();
  const identity = {
    initialName: '卡片作者',
    initialAvatar: 'https://example.com/avatar.jpg',
    initialHeadline: '卡片简介',
  };
  expect(mockProfileHeader).toHaveBeenLastCalledWith(
    expect.objectContaining({
      ...identity,
      isLoading: true,
      user: expect.objectContaining({ name: '卡片作者', headline: '卡片简介' }),
    }),
  );
  await act(async () => finish?.(member));
  await flushQueries();
  expect(mockProfileHeader).toHaveBeenLastCalledWith(
    expect.objectContaining({ ...identity, isLoading: false, user: member }),
  );
  expect(host.getByTestId('profile-entry-content')).toBeVisible();
  await host.unmount();
});

test('a failed initial profile request replaces the placeholder with a retry', async () => {
  client.removeQueries({ queryKey: ['user-detail', mockRoute.id] });
  let fail: ((error: Error) => void) | undefined;
  jest.mocked(getMemberWithFallback).mockReturnValue(
    new Promise((_, reject) => {
      fail = reject;
    }),
  );
  const host = await render(screen());
  expect(host.getByTestId('profile-entry-content')).toBeTruthy();
  await act(async () => fail?.(new Error('synthetic failure')));
  await flushQueries();
  expect(host.getByText('用户资料加载失败')).toBeVisible();
  expect(host.queryByTestId('profile-entry-content')).toBeNull();
  await host.unmount();
});

test('profile content remains visible outside an animated pane', async () => {
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const host = await render(screen());
    await flushQueries();
    expect(host.getByTestId('profile-entry-content')).toBeVisible();
    expect(timing).not.toHaveBeenCalled();
    await host.unmount();
  } finally {
    timing.mockRestore();
  }
});

test.each([true, false])(
  'the creation tab sits between activity and answers and loads for own profile: %s',
  async (ownProfile) => {
    mockRoute.tab = 'answers';
    mockAuthState.me = ownProfile
      ? member
      : { ...member, id: 'other-member', url_token: 'other-token' };
    client.setQueryData(['me'], mockAuthState.me);
    mockCreations([
      creationCard('article', 'creation-article', '最近更新的创作'),
    ]);
    const host = await render(screen());
    expect(
      host.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel),
    ).toEqual([
      '动态',
      '创作',
      '回答',
      '文章',
      '专栏',
      '提问',
      '想法',
      '我赞同过',
    ]);
    expect(host.getByTestId('profile-owner')).toHaveTextContent(
      ownProfile ? '自己的主页' : '其他人的主页',
    );
    expect(mockPagerProps.initialPage).toBe(2);
    expect(getMemberRelations).not.toHaveBeenCalledWith(
      expect.anything(),
      'pins',
      expect.anything(),
      expect.anything(),
    );

    await fireEvent.press(host.getByRole('tab', { name: '创作' }));
    expect(mockSetPage).toHaveBeenLastCalledWith(1);
    await act(() =>
      mockPagerProps.onPageSelected({ nativeEvent: { position: 1 } }),
    );
    await flushQueries();
    // 创作 reads the App's own list for the member.
    expect(fetchMemberCreations).toHaveBeenCalledWith(
      member.id,
      undefined,
      expect.anything(),
    );
    expect(getRecentMemberActivities).not.toHaveBeenCalled();
    expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
    expect(mockListProps.get('创作')?.active).toBe(true);
    expect(host.getByText('最近更新的创作')).toBeTruthy();
    await host.unmount();
  },
);

test.each([undefined, 'invalid-tab', 'creations'])(
  'a missing, invalid or creation tab opens creations immediately: %s',
  async (tab) => {
    mockRoute.tab = tab;
    client.setQueryData(['me'], member);
    const host = await render(screen());
    await flushQueries();
    expect(mockPagerProps.initialPage).toBe(1);
    expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
    expect(fetchMemberCreations).toHaveBeenCalledTimes(1);
    expect(getMemberRelations).not.toHaveBeenCalled();
    await host.unmount();
  },
);

test('columns load on first visit and unwrap the column for navigation', async () => {
  mockRoute.tab = 'answers';
  const column = {
    id: 'synthetic-column',
    type: 'column' as const,
    title: '合成专栏',
    intro: '专栏简介',
    image_url: 'https://example.com/column.jpg',
    followers: 3,
    items_count: 2,
  };
  jest.mocked(getMemberColumnContributions).mockResolvedValue({
    data: [{ column, contributions_count: 1 }],
    paging: { ...emptyPage.paging, totals: 1 },
  });
  const host = await render(screen());
  await flushQueries();
  expect(getMemberColumnContributions).not.toHaveBeenCalled();

  await fireEvent.press(host.getByRole('tab', { name: '专栏' }));
  expect(mockSetPage).toHaveBeenLastCalledWith(4);
  await act(() =>
    mockPagerProps.onPageSelected({ nativeEvent: { position: 4 } }),
  );
  await flushQueries();
  expect(getMemberColumnContributions).toHaveBeenCalledTimes(1);
  expect(getMemberColumnContributions).toHaveBeenCalledWith(
    member.url_token,
    0,
    expect.objectContaining({ aborted: false }),
  );
  expect(host.getByRole('tab', { name: '专栏' })).toBeSelected();
  expect(mockListProps.get('专栏')?.query.data).toEqual([column]);
  expect(host.getByText('专栏简介')).toBeTruthy();
  await fireEvent.press(host.getByRole('button', { name: column.title }));
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: '/column/[id]',
    params: { id: column.id },
  });
  await host.unmount();
});

test('a failed profile refresh retains the cached header and native pager', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  jest.mocked(getMemberRelations).mockResolvedValue({
    ...emptyPage,
    // This endpoint can omit author identity even though its owner is known.
    data: [
      {
        ...votedAnswer,
        author: { ...votedAnswer.author, id: '', url_token: '' },
      },
    ],
  });
  const host = await render(screen());
  await flushQueries();
  expect(mockFeedContexts.get(`answers:${votedAnswer.id}`)).toEqual({
    scene: 'profile_answer',
    memberId: mockRoute.id,
    memberSort: 'created',
  });
  const pager = host.getByTestId('native-profile-pager');
  jest.mocked(getMemberWithFallback).mockRejectedValue(new Error('offline'));
  await act(async () => {
    await mockListProps.get('回答')?.query.refresh();
  });
  await flushQueries();
  expect(client.getQueryState(['user-detail', mockRoute.id])?.status).toBe(
    'error',
  );
  expect(host.getByTestId('native-profile-pager')).toBe(pager);
  expect(host.getByTestId('profile-owner')).toBeTruthy();
  expect(mockPagerUnmount).not.toHaveBeenCalled();
  expect(mockListUnmount).not.toHaveBeenCalled();
  await host.unmount();
});

test('search opens a separate route without altering the active tab or list offsets', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  const pager = host.getByTestId('native-profile-pager');
  expect(host.queryByPlaceholderText('搜索 合成作者 的创作...')).toBeNull();
  await fireEvent.press(host.getByLabelText('搜索此用户的创作'));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/user/[id]/search',
    params: { id: 'member-readable-token' },
  });
  expect(host.getByTestId('native-profile-pager')).toBe(pager);
  expect(host.getByRole('tab', { name: '回答' })).toBeSelected();
  expect(mockListProps.get('回答')?.active).toBe(true);
  expect(mockScrollToOffset).not.toHaveBeenCalled();
  expect(mockSetPage).not.toHaveBeenCalled();
  expect(mockPagerUnmount).not.toHaveBeenCalled();
  expect(mockListUnmount).not.toHaveBeenCalled();
  expect(searchContent).not.toHaveBeenCalled();
  await host.unmount();
});

test('holds page swipes while a list scrolls vertically and briefly after', async () => {
  mockRoute.tab = 'answers';
  const host = await render(screen());
  await flushQueries();
  expect(mockPagerProps.scrollEnabled).toBe(true);
  const reportActivity = mockListProps.get('回答')?.onScrollActivityChange;
  await act(async () => reportActivity?.(true));
  expect(mockPagerProps.scrollEnabled).toBe(false);
  // The fling that follows a drag keeps the pager held.
  await act(async () => {
    reportActivity?.(false);
    reportActivity?.(true);
  });
  expect(mockPagerProps.scrollEnabled).toBe(false);
  await act(async () => reportActivity?.(false));
  expect(mockPagerProps.scrollEnabled).toBe(false);
  await flushQueries(300);
  expect(mockPagerProps.scrollEnabled).toBe(true);
  await host.unmount();
});

test('a page swipe records the synced offsets so the header holds its place', async () => {
  mockRoute.tab = 'answers';
  const host = await render(screen());
  await flushQueries();
  // Measure a real header so the lists have a collapse range to share.
  await fireEvent(host.getByTestId('profile-collapsible-header'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 600 } },
  });
  const offsets = mockListProps.get('回答')?.offsets;
  if (!offsets) throw new Error('lists share the offsets');
  const collapse = mockListProps.get('回答')?.collapseDistance ?? 0;
  expect(collapse).toBeGreaterThan(0);
  const answersIndex = mockListProps.get('回答')?.index ?? 0;
  const deep = [...offsets.value];
  deep[answersIndex] = collapse + 500;
  offsets.value = deep;
  await act(async () =>
    mockPagerProps.onPageScrollStateChanged({
      nativeEvent: { pageScrollState: 'dragging' },
    }),
  );
  // Every other page now reports at least the collapsed header position.
  offsets.value.forEach((offset, index) => {
    if (index !== answersIndex) expect(offset).toBe(collapse);
  });
  await host.unmount();
});

test('with 多页同时加载 on, the answers tab requests three offsets per load', async () => {
  const { useSettingsStore } = jest.requireMock<
    typeof import('../src/store/useSettingsStore')
  >('../src/store/useSettingsStore');
  useSettingsStore.setState({ enableParallelPaging: true });
  mockRoute.tab = 'answers';
  const host = await render(screen());
  await flushQueries();
  expect(
    jest
      .mocked(getMemberRelations)
      .mock.calls.filter(([, kind]) => kind === 'answers')
      .map(([, , params]) => params.offset),
  ).toEqual([0, 20, 40]);
  useSettingsStore.setState({ enableParallelPaging: false });
  await host.unmount();
});

test('switching member routes resets visited tabs and the native pager', async () => {
  mockRoute.tab = 'answers';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  await fireEvent.press(host.getByRole('tab', { name: '创作' }));
  await act(() =>
    mockPagerProps.onPageSelected({ nativeEvent: { position: 1 } }),
  );
  await flushQueries();

  const secondMember = {
    ...member,
    id: 'second-member-id',
    url_token: 'second-member-token',
    name: '另一位作者',
  };
  mockRoute = { id: secondMember.url_token };
  client.setQueryData(['user-detail', mockRoute.id], secondMember);
  await host.rerender(screen());
  await flushQueries(350);

  expect(host.queryByTestId('profile-list-搜索结果')).toBeNull();
  expect(mockPagerProps.initialPage).toBe(1);
  expect(host.getByRole('tab', { name: '创作' })).toBeSelected();
  expect(mockListProps.get('创作')?.active).toBe(true);
  expect(mockListProps.get('回答')?.active).toBe(false);
  expect(mockPagerMount).toHaveBeenCalledTimes(2);
  expect(mockPagerUnmount).toHaveBeenCalledTimes(1);
  expect(searchContent).not.toHaveBeenCalled();
  // The first member's 回答 and 创作, then only the second member's 创作.
  expect(getMemberRelations).toHaveBeenCalledTimes(1);
  expect(
    jest.mocked(fetchMemberCreations).mock.calls.map(([memberId]) => memberId),
  ).toEqual([member.id, secondMember.id]);
  await host.unmount();
});

test('creation cards of different types retain distinct list keys when their IDs coincide', async () => {
  mockRoute.tab = 'creations';
  client.setQueryData(['me'], member);
  jest.mocked(getMemberActivities).mockResolvedValue({
    ...emptyPage,
    data: [
      {
        id: 'linked-answer-event',
        target: {
          type: 'answer',
          url: 'https://www.zhihu.com/question/123/answer/456',
          author: { ...member, type: 'people' },
          question: { id: '123', title: '已知链接中的回答' },
          content: '<p>链接回答正文</p>',
        },
      },
      {
        id: 'unsupported-answer-event',
        target: {
          type: 'answer',
          url: 'https://example.test/answer/789',
          question: { title: '无法确认的回答链接' },
        },
      },
    ],
  });
  mockCreations([
    creationCard('answer', 'shared-content-id', '相同标识的回答'),
    creationCard('article', 'shared-content-id', '相同标识的文章'),
    creationCard('answer', 'other-answer-id', '其他作者回答', 'another-author'),
  ]);
  const host = await render(screen());
  await flushQueries();
  expect(host.getByText('相同标识的回答')).toBeTruthy();
  expect(host.getByText('相同标识的文章')).toBeTruthy();
  expect(mockFeedContexts.get('answers:shared-content-id')).toEqual({
    scene: 'profile_answer',
    memberId: mockRoute.id,
    memberSort: 'created',
  });
  const list = mockListProps.get('创作');
  expect(mockFeedContexts.get('answers:other-answer-id')).toEqual({
    scene: 'unknown',
  });
  // In the server's order; the owner's cards skip the author row.
  expect(list?.query.data.map(list.keyExtractor)).toEqual([
    'user-creation-answers-shared-content-id',
    'user-creation-articles-shared-content-id',
    'user-creation-answers-other-answer-id',
  ]);
  expect(mockFeedItems.get('shared-content-id')?.hideAuthor).toBe(true);
  expect(mockFeedItems.get('other-answer-id')?.hideAuthor).toBe(false);
  const keys = list?.query.data.map(list.keyExtractor);
  expect(keys).toHaveLength(3);
  expect(new Set(keys).size).toBe(3);
  await fireEvent.press(host.getByRole('tab', { name: '动态' }));
  await flushQueries();
  expect(mockFeedItems.get('456')).toMatchObject({
    id: '456',
    content: '<p>链接回答正文</p>',
  });
  expect(mockFeedContexts.get('answers:456')).toEqual({
    scene: 'profile_answer',
    memberId: mockRoute.id,
    memberSort: 'created',
  });
  expect(host.queryByText('无法确认的回答链接')).toBeNull();
  await host.unmount();
});

test.each([true, false])(
  'voted answers load after visiting the tab for own profile: %s',
  async (ownProfile) => {
    mockAuthState.me = ownProfile
      ? member
      : { ...member, id: 'other-member', url_token: 'other-token' };
    client.setQueryData(['me'], mockAuthState.me);
    jest.mocked(getMemberAnswersVotedByMe).mockResolvedValue({
      ...emptyPage,
      data: [votedAnswer],
      paging: { ...emptyPage.paging, totals: 1 },
    });
    const host = await render(screen());
    await flushQueries();

    expect(host.getByTestId('profile-owner')).toHaveTextContent(
      ownProfile ? '自己的主页' : '其他人的主页',
    );
    expect(getMemberAnswersVotedByMe).not.toHaveBeenCalled();
    expect(host.getByRole('tab', { name: '创作' })).toBeSelected();

    await fireEvent.press(host.getByRole('tab', { name: '我赞同过' }));
    expect(mockSetPage).toHaveBeenLastCalledWith(7);
    await act(() =>
      mockPagerProps.onPageSelected({ nativeEvent: { position: 7 } }),
    );
    await flushQueries();
    expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(1);
    expect(getMemberAnswersVotedByMe).toHaveBeenCalledWith(
      member.url_token,
      0,
      expect.objectContaining({ aborted: false }),
    );
    expect(host.getByRole('tab', { name: '我赞同过' })).toBeSelected();
    expect(mockListProps.get('我赞同过')?.active).toBe(true);
    expect(host.getByText(votedAnswer.question.title)).toBeTruthy();

    await act(() =>
      mockPagerProps.onPageSelected({ nativeEvent: { position: 1 } }),
    );
    await act(() =>
      mockPagerProps.onPageSelected({ nativeEvent: { position: 7 } }),
    );
    await flushQueries();
    expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(1);
    expect(mockPagerUnmount).not.toHaveBeenCalled();
    expect(mockListUnmount).not.toHaveBeenCalled();
    await host.unmount();
  },
);

test('the votes route counts answers by this profile author that the current account upvoted', async () => {
  mockRoute.tab = 'votes';
  mockAuthState.me = {
    ...member,
    id: 'current-account-id',
    url_token: 'current-account-token',
  };
  client.setQueryData(['me'], mockAuthState.me);
  client.setQueryData(['user-detail', mockRoute.id], {
    ...member,
    voteup_count: 9999,
  });
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValue({
    ...emptyPage,
    data: [votedAnswer],
    paging: { ...emptyPage.paging, totals: 17 },
  });
  const host = await render(screen());
  await flushQueries();

  expect(mockPagerProps.initialPage).toBe(7);
  expect(host.getByRole('tab', { name: '我赞同过' })).toBeSelected();
  expect(getRecentMemberActivities).not.toHaveBeenCalled();
  expect(getMemberRelations).not.toHaveBeenCalled();
  expect(host.getByText('我赞同过 17')).toBeTruthy();
  expect(
    host.getByText('我赞同过 · 17', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(host.queryByText('我赞同过 9999')).toBeNull();
  expect(mockFeedItems.get(votedAnswer.id)).toMatchObject({
    id: votedAnswer.id,
    type: 'answers',
    title: votedAnswer.question.title,
    questionId: votedAnswer.question.id,
    author: {
      id: votedAnswer.author.id,
      url_token: votedAnswer.author.url_token,
      name: votedAnswer.author.name,
      avatar: votedAnswer.author.avatar_url,
      headline: votedAnswer.author.headline,
    },
    voted: 1,
    isCollected: true,
    favlistsCount: 5,
    content: votedAnswer.content,
  });
  expect(mockFeedContexts.get(`answers:${votedAnswer.id}`)).toEqual({
    scene: 'profile_answer',
    memberId: mockRoute.id,
    memberSort: 'created',
  });
  expect(mockFeedItems.get(votedAnswer.id)?.author.id).toBe(member.id);
  expect(mockFeedItems.get(votedAnswer.id)?.author.id).not.toBe(
    mockAuthState.me.id,
  );
  expect(mockListProps.get('我赞同过')?.listHeader).toBeUndefined();
  await host.unmount();
});

test('unknown voted-answer totals stay hidden and missing authors do not become the profile owner', async () => {
  mockRoute.tab = 'votes';
  client.setQueryData(['me'], member);
  client.setQueryData(['user-detail', mockRoute.id], {
    ...member,
    voteup_count: 9999,
  });
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValue({
    data: [
      {
        ...votedAnswer,
        author: {
          id: '',
          url_token: '',
          name: '',
          avatar_url: '',
          type: 'people',
        },
      },
    ],
    paging: { is_end: true, is_start: true, next: '', previous: '' },
  });
  const host = await render(screen());
  await flushQueries();

  expect(
    host.getAllByText('我赞同过', { includeHiddenElements: true }),
  ).toHaveLength(2);
  expect(mockFeedItems.get(votedAnswer.id)?.author).toMatchObject({
    id: '',
    url_token: '',
    name: '匿名用户',
    headline: '',
  });
  expect(mockFeedContexts.get(`answers:${votedAnswer.id}`)).toEqual({
    scene: 'unknown',
  });
  await host.unmount();
});

test('zero voted-answer totals appear in the tab and toolbar', async () => {
  mockRoute.tab = 'votes';
  client.setQueryData(['me'], member);
  const host = await render(screen());
  await flushQueries();

  expect(host.getByText('我赞同过 0')).toBeTruthy();
  expect(
    host.getByText('我赞同过 · 0', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(mockListProps.get('我赞同过')?.query.data).toEqual([]);
  expect(host.getByText('暂无我赞同过的回答')).toBeTruthy();
  await host.unmount();
});

test('voted-answer query errors, retry and pagination reach the profile list', async () => {
  mockRoute.tab = 'votes';
  client.setQueryData(['me'], member);
  jest
    .mocked(getMemberAnswersVotedByMe)
    .mockRejectedValue(new Error('offline'));
  const host = await render(screen());
  await flushQueries();

  expect(mockListProps.get('我赞同过')?.query.isError).toBe(true);
  expect(mockListProps.get('我赞同过')?.query.isLoading).toBe(false);
  expect(mockListProps.get('我赞同过')?.query.data).toEqual([]);
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    data: [votedAnswer],
    paging: {
      ...emptyPage.paging,
      is_end: false,
      next: 'https://www.zhihu.com/api/v4/members/member-readable-token/relations/vote?offset=20',
      totals: 2,
    },
  });
  await act(async () => {
    await mockListProps.get('我赞同过')?.query.refetch();
  });
  await flushQueries();
  expect(mockListProps.get('我赞同过')?.query.isError).toBe(false);
  expect(mockListProps.get('我赞同过')?.query.hasNextPage).toBe(true);
  expect(host.getByText(votedAnswer.question.title)).toBeTruthy();

  const secondAnswer = {
    ...votedAnswer,
    id: 'next-voted-answer',
    question: { ...votedAnswer.question, title: '下一页的我赞同过回答' },
  };
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    ...emptyPage,
    data: [secondAnswer],
    paging: { ...emptyPage.paging, totals: 2 },
  });
  await act(async () => {
    await mockListProps.get('我赞同过')?.query.fetchNextPage();
  });
  await flushQueries();
  expect(host.getByText(secondAnswer.question.title)).toBeTruthy();
  expect(mockListProps.get('我赞同过')?.query.hasNextPage).toBe(false);
  expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(3);
  expect(getMemberAnswersVotedByMe).toHaveBeenLastCalledWith(
    member.url_token,
    20,
    expect.objectContaining({ aborted: false }),
  );
  await host.unmount();
});

test('refreshing voted answers resets their pages and preserves other tab caches', async () => {
  mockRoute.tab = 'votes';
  client.setQueryData(['me'], member);
  const otherTabData = {
    pages: [emptyPage, emptyPage],
    pageParams: [0, 20],
  };
  const otherTabKey = ['user-answers', mockRoute.id, 'created'];
  client.setQueryData(otherTabKey, otherTabData);
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    data: [votedAnswer],
    paging: {
      ...emptyPage.paging,
      is_end: false,
      next: 'https://www.zhihu.com/api/v4/members/member-readable-token/relations/vote?offset=20',
      totals: 2,
    },
  });
  const host = await render(screen());
  await flushQueries();
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    ...emptyPage,
    data: [{ ...votedAnswer, id: 'old-second-page-answer' }],
    paging: { ...emptyPage.paging, totals: 2 },
  });
  await act(async () => {
    await mockListProps.get('我赞同过')?.query.fetchNextPage();
  });
  await flushQueries();
  expect(mockListProps.get('我赞同过')?.query.data).toHaveLength(2);

  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    ...emptyPage,
    data: [votedAnswer],
    paging: { ...emptyPage.paging, totals: 1 },
  });
  await act(async () => {
    await mockListProps.get('我赞同过')?.query.refresh();
  });
  await flushQueries();
  expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(3);
  expect(getMemberAnswersVotedByMe).toHaveBeenLastCalledWith(
    member.url_token,
    0,
    expect.objectContaining({ aborted: false }),
  );
  expect(getMemberWithFallback).toHaveBeenCalledTimes(1);
  expect(mockListProps.get('我赞同过')?.query.data).toEqual([votedAnswer]);
  expect(client.getQueryData(otherTabKey)).toEqual(otherTabData);
  expect(host.getByText('我赞同过 1')).toBeTruthy();
  await host.unmount();
});

test.each(['', '_xsrf=synthetic-xsrf'])(
  'guests see a login entry instead of fetching account-specific votes: %s',
  async (cookies) => {
    mockRoute.tab = 'votes';
    mockAuthState = { cookies, me: null };
    client.setQueryData(['me'], null);
    const host = await render(screen());
    await flushQueries();

    expect(getMemberAnswersVotedByMe).not.toHaveBeenCalled();
    expect(host.getByRole('tab', { name: '我赞同过' })).toBeSelected();
    expect(host.getByText('登录后查看我赞同过的回答')).toBeTruthy();
    expect(mockListProps.get('我赞同过')?.query.data).toEqual([]);
    expect(mockListProps.get('我赞同过')?.query.isLoading).toBe(false);
    await fireEvent.press(host.getByRole('button', { name: '登录' }));
    expect(mockPush).toHaveBeenCalledWith('/login');
    await host.unmount();
  },
);

test('switching accounts hides the previous account votes before the new query resolves', async () => {
  mockRoute.tab = 'votes';
  const previousAnswer = {
    ...votedAnswer,
    id: 'previous-account-answer',
    question: { ...votedAnswer.question, title: '原账号赞同过的回答' },
  };
  jest.mocked(getMemberAnswersVotedByMe).mockResolvedValueOnce({
    ...emptyPage,
    data: [previousAnswer],
    paging: { ...emptyPage.paging, totals: 9 },
  });
  const host = await render(screen());
  await flushQueries();
  expect(host.getByText(previousAnswer.question.title)).toBeTruthy();
  expect(host.getByText('我赞同过 9')).toBeTruthy();

  let finish:
    | ((page: Awaited<ReturnType<typeof getMemberAnswersVotedByMe>>) => void)
    | undefined;
  jest.mocked(getMemberAnswersVotedByMe).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mockSessionVersion += 1;
  mockAuthState = {
    cookies: 'z_c0=synthetic-second-session',
    me: { ...member, id: 'second-account-id', url_token: 'second-account' },
  };
  client.setQueryData(['me'], mockAuthState.me);
  await host.rerender(screen());
  expect(host.queryByText(previousAnswer.question.title)).toBeNull();
  expect(host.queryByText('我赞同过 9')).toBeNull();
  expect(mockListProps.get('我赞同过')?.query.data).toEqual([]);
  expect(mockListProps.get('我赞同过')?.query.isLoading).toBe(true);
  expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(2);

  const nextAnswer = {
    ...votedAnswer,
    id: 'new-account-answer',
    question: { ...votedAnswer.question, title: '新账号赞同过的回答' },
  };
  await act(async () => {
    finish?.({
      ...emptyPage,
      data: [nextAnswer],
      paging: { ...emptyPage.paging, totals: 1 },
    });
  });
  await flushQueries();
  expect(host.getByText(nextAnswer.question.title)).toBeTruthy();
  expect(host.getByText('我赞同过 1')).toBeTruthy();
  expect(host.queryByText(previousAnswer.question.title)).toBeNull();

  mockSessionVersion += 1;
  mockAuthState = { cookies: '', me: null };
  client.setQueryData(['me'], null);
  await host.rerender(screen());
  expect(host.queryByText(nextAnswer.question.title)).toBeNull();
  expect(host.queryByText('我赞同过 1')).toBeNull();
  expect(host.getByText('登录后查看我赞同过的回答')).toBeTruthy();
  expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(2);
  await host.unmount();
});

test('an expired login shows the login entry even when its existing query failed', async () => {
  mockRoute.tab = 'votes';
  jest
    .mocked(getMemberAnswersVotedByMe)
    .mockRejectedValue(new Error('synthetic-expired-login'));
  const host = await render(screen());
  await flushQueries();
  expect(mockListProps.get('我赞同过')?.query.isError).toBe(true);

  mockAuthState = { ...mockAuthState, cookies: '_xsrf=synthetic-xsrf' };
  await host.rerender(screen());
  expect(mockListProps.get('我赞同过')?.query.isError).toBe(false);
  expect(mockListProps.get('我赞同过')?.query.isLoading).toBe(false);
  expect(mockListProps.get('我赞同过')?.query.hasNextPage).toBe(false);
  expect(host.getByText('登录后查看我赞同过的回答')).toBeTruthy();
  expect(getMemberAnswersVotedByMe).toHaveBeenCalledTimes(1);
  await host.unmount();
});
