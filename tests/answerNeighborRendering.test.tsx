import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { type AnswerDetail, getAnswer } from '../api/zhihu';
import { getAllContentCollectionStatus } from '../api/zhihu/collection';
import { AnswerDetailView } from '../components/AnswerDetailView';
import type { RichContentLoadingPhase } from '../features/rich-content';
import {
  getAnswerEndorsementsKey,
  seedAnswerEndorsements,
} from '../utils/answerEndorsements';

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
let mockSessionVersion = 1;
let mockLayoutReady: () => void;
let mockContentLoadingPhase: RichContentLoadingPhase | null = null;

jest.mock('../api/zhihu', () => ({
  getAnswer: jest.fn(),
  deleteAnswer: jest.fn(),
}));
jest.mock('../api/zhihu/collection', () => ({
  getAllContentCollectionStatus: jest.fn(),
}));
jest.mock('../api/zhihu/member', () => ({
  followMember: jest.fn(),
  unfollowMember: jest.fn(),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-blur', () => ({
  BlurView:
    jest.requireActual<typeof import('react-native')>('react-native').View,
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
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
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../components/AnswerEndorsements', () => {
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
jest.mock('../components/ContentRelationshipNotice', () => {
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
jest.mock('../components/DetailNavigationHeader', () => ({
  useDetailNavigationHeight: () => 44,
}));
jest.mock('../components/DownvoteButton', () => ({
  DownvoteButton: () => null,
}));
jest.mock('../components/FollowButton', () => ({ FollowButton: () => null }));
jest.mock('../components/LikeButton', () => ({ LikeButton: () => null }));
jest.mock('../components/MoreActionsButton', () => ({
  MoreActionsButton: () => null,
}));
jest.mock('../components/QueryErrorView', () => ({
  QueryErrorView: () => null,
}));
jest.mock('../components/ReadingProgressNotice', () => ({
  ReadingProgressNotice: () => null,
}));
jest.mock('../components/ReadingScrollIndicator', () => ({
  ReadingScrollIndicator: () => null,
}));
jest.mock('../components/ShareMenu', () => ({ ShareMenu: () => null }));
jest.mock('../components/StableAvatar', () => ({ StableAvatar: () => null }));
jest.mock('../components/VoterListModal', () => ({
  VoterListModal: () => null,
}));
jest.mock('../hooks/useOptimisticToggle', () => ({
  useOptimisticToggle: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('../hooks/useReadingProgress', () => ({
  useReadingProgress: (options: ReadingOptions) => mockReadingProgress(options),
}));
jest.mock('../hooks/useReadingContentMeasurement', () => ({
  useReadingContentMeasurement: (options: MeasurementOptions) =>
    mockReadingMeasurement(options),
}));
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: () => unknown) => selector(),
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: Settings) => unknown) =>
      selector({
        richContentRenderer: 'native-v2',
        fontSizeScale: 1,
        lineHeightScale: 1,
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
jest.mock('../store/useCollectionStore', () => ({
  useCollectionStore: (selector: (state: Collections) => unknown) =>
    selector({ setCollectedStatus: jest.fn(), collectedStatusMap: {} }),
}));
jest.mock('../features/rich-content', () => {
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
    default: { View: native.View, ScrollView: native.ScrollView },
    SharedTransition: { duration: () => ({}) },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedScrollHandler: () => jest.fn(),
    runOnJS: <T,>(callback: T) => callback,
  };
});

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
}: {
  cached?: boolean;
  isFocused?: boolean;
  isPreloading?: boolean;
  cachedAnswer?: AnswerDetail;
  endorsementSource?: EndorsementSource;
  entryEndorsements?: unknown;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
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
  mockSessionVersion = 1;
  mockContentLoadingPhase = null;
  jest.mocked(getAnswer).mockResolvedValue(answer);
  jest
    .mocked(getAllContentCollectionStatus)
    .mockImplementation(() => new Promise(() => {}));
});

afterEach(() => {
  for (const client of clients) client.clear();
  clients.length = 0;
});

test('mounts a cached neighboring body before focus without starting detail, collection, relationship, or reading work', async () => {
  const host = await renderAnswer();

  expect(host.getByTestId('answer-body')).toHaveTextContent(answer.content);
  expect(mockBodyMount).toHaveBeenCalledTimes(1);
  expect(getAnswer).not.toHaveBeenCalled();
  expect(getAllContentCollectionStatus).not.toHaveBeenCalled();
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
])('reports %s for a cached answer without claiming to fetch its body', async (phase, message) => {
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
});

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
