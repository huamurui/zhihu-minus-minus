import { act, render } from '@testing-library/react-native';
import React from 'react';
import AnswerDetailScreen from '../app/answer/[id]';
import { calculateDetailHeaderAppearance } from '../utils/detailHeaderAppearance';

interface PagerProps {
  children?: React.ReactNode;
  initialPage: number;
  onPageSelected: (event: { nativeEvent: { position: number } }) => void;
  onPageScrollStateChanged: (event: {
    nativeEvent: { pageScrollState: string };
  }) => void;
  onPageScroll: (event: {
    nativeEvent: { position: number; offset: number };
  }) => void;
}

interface AnswerProps {
  id: string;
  endorsementSource?: {
    answerId: string;
    sessionVersion: number;
    endorsements: readonly unknown[];
  };
  questionId?: string;
  initialTitle?: string;
  isFocused: boolean;
  isPreloading: boolean;
  onScroll?: (offset: number) => void;
  onHeaderLayout?: (collapseOffset: number) => void;
  headerProgress?: { value: number };
  activeAnswerId?: { value: string };
  activeScrollY?: { value: number };
  scopeVersion?: number;
  activeScopeVersion?: { value: number };
}

interface HeaderProps {
  title?: string;
  onTitlePress?: () => void;
  collapsed: boolean;
  author?: { name: string };
  progress: { value: number };
  onMore?: () => void;
}

interface HeaderMenuProps {
  visible: boolean;
  onClose: () => void;
  type: string;
  data: { id: string | number; title?: string; author?: string } | null;
}

let mockParams: {
  id: string;
  questionId?: string;
  sortBy: string;
  readingMode?: string;
  title?: string;
  answerScene?: string;
  memberId?: string;
  memberSort?: string;
};
let mockReadingMode: 'detail' | 'preview-list' = 'detail';
let mockSessionVersion = 1;
const mockPreviewProps = jest.fn();
let mockPages:
  | {
      data: {
        id: string;
        question?: { id: string };
        endorsements?: unknown[];
      }[];
    }[]
  | undefined;
const mockAnswerQuestions = new Map<string, { id: string; title: string }>();
const mockUnavailableAnswers = new Set<string>();
const mockPagerSource = jest.fn();
let mockPagerProps: PagerProps;
let mockPagerMounts: number;
let mockHeaderProps: HeaderProps;
let mockHeaderMenuProps: HeaderMenuProps;
const mockAnswerProps = new Map<string, AnswerProps>();
const mockAnswerMounts = new Map<string, number>();
const mockHeaderThresholds = new Map<string, number>();
const mockSetPage = jest.fn();
const mockSetParams = jest.fn();
const mockFetchNextPage = jest.fn();
const mockRouter = {
  setParams: mockSetParams,
  push: jest.fn(),
  back: jest.fn(),
};
const mockQueryClient = { prefetchQuery: jest.fn(), getQueryData: jest.fn() };
const originalRequestIdleCallback = Object.getOwnPropertyDescriptor(
  globalThis,
  'requestIdleCallback',
);
const originalCancelIdleCallback = Object.getOwnPropertyDescriptor(
  globalThis,
  'cancelIdleCallback',
);

jest.mock('@tanstack/react-query', () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: mockUnavailableAnswers.has(String(queryKey[1]))
      ? undefined
      : {
          id: String(queryKey[1]),
          question: mockAnswerQuestions.get(String(queryKey[1])) || {
            id: mockParams.questionId,
            title: '问题',
          },
          author: { name: `作者 ${queryKey[1]}` },
        },
    isLoading: mockUnavailableAnswers.has(String(queryKey[1])),
  }),
  useQueryClient: () => mockQueryClient,
}));
jest.mock('../hooks/useActiveScreen', () => ({ useActiveScreen: () => true }));
jest.mock('../hooks/useAnswerPagerSource', () => ({
  useAnswerPagerSource: (options: {
    initialId: string;
    questionId?: string | number;
    sortBy: string;
    context: { scene: string; memberId?: string; memberSort?: string };
  }) => {
    mockPagerSource(options);
    const { questionId, sortBy, context } = options;
    return {
      data: mockPages ? { pages: mockPages } : undefined,
      fetchNextPage: mockFetchNextPage,
      hasNextPage: false,
      isFetchingNextPage: false,
      isQuestionSource: context.scene !== 'profile_answer',
      sessionVersion: mockSessionVersion,
      pagerKey: JSON.stringify([
        mockSessionVersion,
        context.scene,
        context.scene === 'profile_answer' ? context.memberId : questionId,
        context.scene === 'profile_answer' ? context.memberSort : sortBy,
      ]),
    };
  },
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => mockRouter,
  Stack: { Screen: () => null },
}));
jest.mock('react-native-pager-view', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: react.forwardRef((props: PagerProps, ref) => {
      mockPagerProps = props;
      react.useImperativeHandle(ref, () => ({
        setPageWithoutAnimation: mockSetPage,
      }));
      react.useEffect(() => {
        mockPagerMounts += 1;
      }, []);
      return react.createElement(native.View, null, props.children);
    }),
  };
});
jest.mock('../components/AnswerDetailView', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AnswerDetailView: (props: AnswerProps) => {
      mockAnswerProps.set(props.id, props);
      react.useEffect(() => {
        mockAnswerMounts.set(
          props.id,
          (mockAnswerMounts.get(props.id) ?? 0) + 1,
        );
      }, [props.id]);
      return react.createElement(native.Text, null, props.id);
    },
  };
});
jest.mock('../components/AnswerPreviewList', () => ({
  AnswerPreviewList: (props: {
    answerId: string;
    questionId?: string;
    title?: string;
  }) => {
    mockPreviewProps(props);
    return jest
      .requireActual<typeof import('react')>('react')
      .createElement(
        jest.requireActual<typeof import('react-native')>('react-native').Text,
        { testID: 'answer-preview-list' },
        props.answerId,
      );
  },
}));
jest.mock('../components/DetailNavigationHeader', () => ({
  DetailNavigationHeader: (props: HeaderProps) => {
    mockHeaderProps = props;
    return null;
  },
}));
jest.mock('../components/ShareMenu', () => ({
  ShareMenu: (props: HeaderMenuProps) => {
    mockHeaderMenuProps = props;
    return null;
  },
}));
jest.mock('../api/client', () => ({ __esModule: true, default: {} }));
jest.mock('../api/zhihu', () => ({ getAnswer: jest.fn() }));
jest.mock('../api/zhihu/history', () => ({ recordReadHistory: jest.fn() }));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#1364cc',
  };
});
jest.mock('../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    (
      selector: (state: {
        enableBrowseHistory: boolean;
        answerReadingMode: string;
      }) => unknown,
    ) =>
      selector({
        enableBrowseHistory: false,
        answerReadingMode: mockReadingMode,
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
jest.mock('../store/useAuthStore', () => ({
  getAuthSessionVersion: () => mockSessionVersion,
  useAuthStore: (selector: () => unknown) => selector(),
}));
jest.mock('../features/rich-content', () => ({
  getNeighborAnswerIds: () => [],
  RICH_CONTENT_STALE_TIME: 300_000,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0 }),
}));
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    SharedTransition: { duration: () => ({}) },
    Extrapolate: { CLAMP: 'clamp' },
    interpolate: () => 1,
    useSharedValue: <T>(value: T) => react.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
  };
});

function setList(ids: string[]): void {
  mockPages = [{ data: ids.map((id) => ({ id })) }];
}

async function selectPage(position: number, props = mockPagerProps) {
  await act(() => props.onPageSelected({ nativeEvent: { position } }));
}

async function startDrag() {
  await scrollState('dragging');
}

async function scrollState(pageScrollState: string, props = mockPagerProps) {
  await act(() =>
    props.onPageScrollStateChanged({
      nativeEvent: { pageScrollState },
    }),
  );
}

async function scrollPage(position: number, offset: number) {
  await act(() =>
    mockPagerProps.onPageScroll({ nativeEvent: { position, offset } }),
  );
}

async function scrollAnswer(
  id: string,
  offset: number,
  props = mockAnswerProps.get(id),
) {
  expect(props?.onScroll).toBeDefined();
  expect(props?.activeScrollY).toBeDefined();
  await act(() => {
    if (
      props?.activeAnswerId?.value === id &&
      props.activeScopeVersion?.value === props.scopeVersion &&
      props.activeScrollY
    ) {
      props.activeScrollY.value = offset;
    }
    props?.onScroll?.(offset);
  });
}

async function reportScrollAnswer(
  id: string,
  offset: number,
  props = mockAnswerProps.get(id),
) {
  expect(props?.onScroll).toBeDefined();
  await act(() => props?.onScroll?.(offset));
}

async function layoutAnswer(id: string, collapseOffset: number) {
  const props = mockAnswerProps.get(id);
  expect(props?.onHeaderLayout).toBeDefined();
  await act(() => props?.onHeaderLayout?.(collapseOffset));
  mockHeaderThresholds.set(
    JSON.stringify([props?.scopeVersion, id]),
    collapseOffset,
  );
}

async function nativeScrollAnswer(
  id: string,
  offset: number,
  props = mockAnswerProps.get(id),
) {
  expect(props?.headerProgress).toBe(mockHeaderProps.progress);
  await act(() => {
    if (
      props?.activeAnswerId?.value === id &&
      props.activeScopeVersion?.value === props.scopeVersion &&
      props.headerProgress
    ) {
      if (props.activeScrollY) props.activeScrollY.value = offset;
      props.headerProgress.value = calculateDetailHeaderAppearance(
        offset,
        mockHeaderThresholds.get(JSON.stringify([props.scopeVersion, id])) ??
          80,
      );
    }
    props?.onScroll?.(offset);
  });
}

async function openHeaderMenu() {
  expect(mockHeaderProps.onMore).toBeDefined();
  await act(() => mockHeaderProps.onMore?.());
}

function renderedAnswerIds(): string[] {
  return React.Children.toArray(mockPagerProps.children).flatMap((child) => {
    if (
      !React.isValidElement<{
        children: React.ReactElement<AnswerProps>;
      }>(child)
    )
      return [];
    return [child.props.children.props.id];
  });
}

beforeEach(() => {
  mockReadingMode = 'detail';
  mockSessionVersion = 1;
  jest.clearAllMocks();
  mockParams = {
    id: '42',
    questionId: '7',
    sortBy: 'default',
    answerScene: 'question_feed',
  };
  mockPages = undefined;
  mockPagerMounts = 0;
  mockHeaderProps = { collapsed: false, progress: { value: 0 } };
  mockHeaderMenuProps = {
    visible: false,
    onClose: jest.fn(),
    type: 'question',
    data: null,
  };
  mockAnswerQuestions.clear();
  mockUnavailableAnswers.clear();
  mockAnswerProps.clear();
  mockAnswerMounts.clear();
  mockHeaderThresholds.clear();
  Object.defineProperty(globalThis, 'requestIdleCallback', {
    configurable: true,
    value: jest.fn(() => 1),
  });
  Object.defineProperty(globalThis, 'cancelIdleCallback', {
    configurable: true,
    value: jest.fn(),
  });
});

afterEach(() => {
  if (originalRequestIdleCallback) {
    Object.defineProperty(
      globalThis,
      'requestIdleCallback',
      originalRequestIdleCallback,
    );
  } else Reflect.deleteProperty(globalThis, 'requestIdleCallback');
  if (originalCancelIdleCallback) {
    Object.defineProperty(
      globalThis,
      'cancelIdleCallback',
      originalCancelIdleCallback,
    );
  } else Reflect.deleteProperty(globalThis, 'cancelIdleCallback');
});

describe('answer pager list transitions', () => {
  it('passes metadata-only list endorsements to their matching pages across reordering and account sessions', async () => {
    const firstEndorsements = [
      { elements: [{ type: 'TEXT', content: '合成入口回答标签' }] },
    ];
    const nextEndorsements = [
      { elements: [{ type: 'TEXT', content: '合成相邻回答标签' }] },
    ];
    const entries = [
      { id: '42', endorsements: firstEndorsements },
      { id: '11', endorsements: nextEndorsements },
      { id: '99' },
    ];
    mockPages = [{ data: entries }];
    const host = await render(React.createElement(AnswerDetailScreen));

    expect(mockAnswerProps.get('42')?.endorsementSource).toEqual({
      answerId: '42',
      sessionVersion: 1,
      endorsements: firstEndorsements,
    });
    expect(mockAnswerProps.get('11')?.endorsementSource).toEqual({
      answerId: '11',
      sessionVersion: 1,
      endorsements: nextEndorsements,
    });
    expect(mockAnswerProps.get('99')?.endorsementSource).toBeUndefined();

    mockPages = [{ data: [entries[1], entries[0], entries[2]] }];
    await host.rerender(React.createElement(AnswerDetailScreen));

    expect(mockAnswerProps.get('42')?.endorsementSource?.endorsements).toEqual(
      firstEndorsements,
    );
    expect(mockAnswerProps.get('11')?.endorsementSource?.endorsements).toEqual(
      nextEndorsements,
    );

    mockSessionVersion = 2;
    mockPages = undefined;
    await host.rerender(React.createElement(AnswerDetailScreen));
    expect(mockAnswerProps.get('42')?.endorsementSource).toBeUndefined();

    const newSessionEndorsements = [
      { elements: [{ type: 'TEXT', content: '合成新账号标签' }] },
    ];
    mockPages = [
      { data: [{ id: '42', endorsements: newSessionEndorsements }] },
    ];
    await host.rerender(React.createElement(AnswerDetailScreen));
    expect(mockAnswerProps.get('42')?.endorsementSource).toEqual({
      answerId: '42',
      sessionVersion: 2,
      endorsements: newSessionEndorsements,
    });
  });

  it('prepares only the immediate neighbors and moves that window with the selected answer', async () => {
    setList(['11', '42', '99', '100', '101']);
    await render(React.createElement(AnswerDetailScreen));
    expect(
      [...mockAnswerProps.values()]
        .filter((answer) => answer.isPreloading)
        .map((answer) => answer.id),
    ).toEqual(['11', '99']);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);

    await selectPage(2);
    expect(
      [...mockAnswerProps.values()]
        .filter((answer) => answer.isPreloading)
        .map((answer) => answer.id),
    ).toEqual(['42', '100']);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockAnswerProps.get('100')?.isFocused).toBe(false);
    expect(mockAnswerProps.get('101')?.isPreloading).toBe(false);
  });

  it.each([
    'recommend',
    'unknown',
    undefined,
  ])('keeps the selected answer mounted and allows swiping when the question list arrives for %s origin', async (answerScene) => {
    mockParams = { ...mockParams, answerScene };
    const page = await render(React.createElement(AnswerDetailScreen));
    const initialPager = mockPagerProps;
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockPagerMounts).toBe(1);
    expect(mockPagerSource).toHaveBeenLastCalledWith(
      expect.objectContaining({
        questionId: '7',
        sortBy: 'default',
        context: { scene: answerScene ?? 'unknown' },
      }),
    );

    setList(['11', '42', '99']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(1);
    expect(mockAnswerMounts.get('42')).toBe(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(false);
    expect(renderedAnswerIds()).toEqual(['11', '42', '99']);
    expect(mockSetPage).toHaveBeenLastCalledWith(1);

    await selectPage(0, initialPager);
    await selectPage(0);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();
    await selectPage(1);
    await startDrag();
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '99' });
  });

  it('retains the selected answer identity when a refreshed list reorders its indexes', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    mockSetParams.mockClear();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('99')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    await selectPage(0);
    expect(mockSetParams).not.toHaveBeenCalled();
    await startDrag();
    await selectPage(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '42' });
  });

  it('keeps a selected answer omitted from a list refresh until the reader leaves it', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('99')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    // Keeping the omitted answer makes the rendered page order unchanged.
    expect(mockSetPage).not.toHaveBeenCalled();
    await startDrag();
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
  });

  it('allows a new selection without dragging after an append that produces no same-position callback', async () => {
    const page = await render(React.createElement(AnswerDetailScreen));
    setList(['42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  });

  it('freezes the rendered list when new API data arrives after a drag has started', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11', '100']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['42', '11', '99']);
    expect(mockSetPage).not.toHaveBeenCalled();

    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    await scrollState('settling');
    const gesturePager = mockPagerProps;
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(renderedAnswerIds()).toEqual(['99', '42', '11', '100']);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockAnswerMounts.get('11')).toBe(1);
    expect(mockPagerMounts).toBe(1);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
    await selectPage(1, gesturePager);
    await selectPage(1);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    await selectPage(2);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
  });

  it('uses the settled native position before applying a list when idle precedes the selected callback', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    const gesturePager = mockPagerProps;
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
    await selectPage(1, gesturePager);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  });

  it('applies only the latest list after multiple updates during a gesture', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await startDrag();
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    setList(['100', '11', '42']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['42', '11']);
    await selectPage(1);
    await scrollState('idle');
    expect(renderedAnswerIds()).toEqual(['100', '11', '42']);
    expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
    // The selected answer stayed at the same index, so no ack gate is needed.
    await selectPage(2);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('accepts native position verification when a moved-page command emits no selected ack', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockSetPage).toHaveBeenLastCalledWith(0);
    await scrollPage(2, 0);
    await selectPage(2);
    expect(mockAnswerProps.get('99')?.isFocused).toBe(true);
    // Native was already at the desired position and never sent an ack.
    await scrollPage(0, 0);
    await selectPage(1);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('accepts accessibility navigation through settling without a prior drag or command ack', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    await scrollState('settling');
    await selectPage(1);
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).toHaveBeenLastCalledWith({ id: '42' });
  });

  it('accepts real animated scroll movement without dragging or a selected callback', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    await scrollPage(0, 0.5);
    setList(['11', '99', '42', '100']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(renderedAnswerIds()).toEqual(['99', '42', '11']);
    await scrollPage(1, 0);
    await scrollState('idle');
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(renderedAnswerIds()).toEqual(['11', '99', '42', '100']);
    expect(mockSetPage).toHaveBeenLastCalledWith(2);
  });

  it.each([
    'questionId',
    'sortBy',
  ] as const)('remounts for a real %s change and resets selection to the route entry answer', async (field) => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(1);
    const oldPager = mockPagerProps;
    mockSetParams.mockClear();
    mockParams = {
      ...mockParams,
      [field]: field === 'questionId' ? '8' : 'updated',
    };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(2);
    expect(mockAnswerMounts.get('42')).toBe(2);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockPagerProps.initialPage).toBe(0);
    await selectPage(1, oldPager);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();

    // Returning before native emits a selection for the new identity must
    // not revive the prior question/sort's selected answer.
    mockParams = {
      id: '42',
      questionId: '7',
      sortBy: 'default',
      answerScene: 'question_feed',
    };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockPagerMounts).toBe(3);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  });

  it('ignores invalid native indexes without changing the focused answer', async () => {
    await render(React.createElement(AnswerDetailScreen));
    for (const index of [-1, 1, 0.5, Number.NaN]) await selectPage(index);
    expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
    expect(mockSetParams).not.toHaveBeenCalled();
  });
});

describe('answer header question menu', () => {
  it('opens a question menu without answer author or collection data and closes it independently', async () => {
    setList(['42', '11', '99']);
    await render(React.createElement(AnswerDetailScreen));
    await nativeScrollAnswer('42', 300);
    expect(mockHeaderProps.collapsed).toBe(true);
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    expect(mockHeaderMenuProps.type).toBe('question');
    expect(mockHeaderMenuProps.data).toEqual({ id: '7', title: '问题' });
    expect(mockAnswerProps.get('42')).not.toHaveProperty('menuRequested');
    expect(mockAnswerProps.get('42')).not.toHaveProperty('onMenuClose');
    await act(() => mockHeaderMenuProps.onClose());
    expect(mockHeaderMenuProps.visible).toBe(false);
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
  });

  it('keeps sharing the same question after paging and does not reopen its menu automatically', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    await selectPage(1);
    expect(mockHeaderMenuProps.visible).toBe(false);
    await selectPage(0);
    expect(mockHeaderMenuProps.visible).toBe(false);
    await selectPage(1);
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    expect(mockHeaderMenuProps.type).toBe('question');
    expect(mockHeaderMenuProps.data).toEqual({ id: '7', title: '问题' });
    expect(mockHeaderProps.author?.name).toBe('作者 11');
    await act(() => mockHeaderMenuProps.onClose());
    expect(mockHeaderMenuProps.visible).toBe(false);
  });

  it('rejects an outgoing header open or menu close without disturbing the current question menu', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    const outgoingMore = mockHeaderProps.onMore;
    const outgoingClose = mockHeaderMenuProps.onClose;
    await selectPage(1);
    await act(() => outgoingMore?.());
    expect(mockHeaderMenuProps.visible).toBe(false);

    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    await act(() => outgoingMore?.());
    expect(mockHeaderMenuProps.visible).toBe(true);
    await act(() => outgoingClose?.());
    expect(mockHeaderMenuProps.visible).toBe(true);
    await act(() => mockHeaderMenuProps.onClose());
    expect(mockHeaderMenuProps.visible).toBe(false);
  });

  it('rejects old scope menu callbacks for the same answer ID after a scope round trip', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    const originalMore = mockHeaderProps.onMore;
    const originalClose = mockHeaderMenuProps.onClose;
    const originalParams = mockParams;
    mockParams = { ...mockParams, sortBy: 'updated' };
    await page.rerender(React.createElement(AnswerDetailScreen));
    const middleMore = mockHeaderProps.onMore;
    const middleClose = mockHeaderMenuProps.onClose;
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    await act(() => originalMore?.());
    await act(() => originalClose?.());
    expect(mockHeaderMenuProps.visible).toBe(true);

    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderMenuProps.visible).toBe(false);
    await act(() => originalMore?.());
    await act(() => middleMore?.());
    expect(mockHeaderMenuProps.visible).toBe(false);
    await openHeaderMenu();
    await act(() => originalClose?.());
    await act(() => middleClose?.());
    expect(mockHeaderMenuProps.visible).toBe(true);
    await act(() => mockHeaderMenuProps.onClose());
    expect(mockHeaderMenuProps.visible).toBe(false);
  });

  it.each([
    'questionId',
    'sortBy',
  ] as const)('clears the question menu after a %s change without reviving it in the original scope', async (field) => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await openHeaderMenu();
    const originalParams = mockParams;
    mockParams = {
      ...mockParams,
      [field]: field === 'questionId' ? '8' : 'updated',
    };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderMenuProps.visible).toBe(false);
    expect(mockHeaderMenuProps.data?.id).toBe(
      field === 'questionId' ? '8' : '7',
    );
    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderMenuProps.visible).toBe(false);
    await openHeaderMenu();
    expect(mockHeaderMenuProps.visible).toBe(true);
    expect(mockHeaderMenuProps.data).toEqual({ id: '7', title: '问题' });
  });
});

describe('answer header state across pager navigation', () => {
  it('restores intermediate header appearance and rejects outgoing scroll reports', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    const outgoingAnswer = mockAnswerProps.get('42');
    await nativeScrollAnswer('42', 120);
    expect(mockHeaderProps.progress.value).toBeCloseTo(28 / 48);

    await selectPage(1);
    expect(mockHeaderProps.progress.value).toBe(0);
    await reportScrollAnswer('42', 400, outgoingAnswer);
    expect(mockHeaderProps.progress.value).toBe(0);
    await nativeScrollAnswer('11', 56);
    expect(mockHeaderProps.progress.value).toBe(0.5);
    await reportScrollAnswer('42', 0, outgoingAnswer);
    expect(mockHeaderProps.progress.value).toBe(0.5);

    await selectPage(0);
    expect(mockHeaderProps.progress.value).toBeCloseTo(28 / 48);
    await selectPage(1);
    expect(mockHeaderProps.progress.value).toBe(0.5);
  });

  it('restores the latest UI offset after a delayed JS report and a round trip', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    await nativeScrollAnswer('42', 130);
    expect(mockHeaderProps.progress.value).toBeCloseTo(38 / 48);
    await reportScrollAnswer('42', 100);
    expect(mockHeaderProps.progress.value).toBeCloseTo(38 / 48);
    await selectPage(1);
    expect(mockHeaderProps.progress.value).toBe(0);
    await selectPage(0);
    expect(mockHeaderProps.progress.value).toBeCloseTo(38 / 48);
  });

  it('keeps intermediate appearance during horizontal movement and a canceled swipe', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    await nativeScrollAnswer('42', 120);
    await startDrag();
    await scrollPage(0, 0.65);
    await nativeScrollAnswer('11', 300);
    expect(mockHeaderProps.progress.value).toBeCloseTo(28 / 48);
    await scrollState('settling');
    await scrollPage(0, 0);
    await scrollState('idle');
    expect(mockHeaderProps.progress.value).toBeCloseTo(28 / 48);
  });

  it('clears appearance on scope changes and rejects an old callback after returning', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    await nativeScrollAnswer('42', 120);
    const outgoingAnswer = mockAnswerProps.get('42');
    const originalParams = mockParams;
    mockParams = { ...mockParams, sortBy: 'updated' };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.progress.value).toBe(0);

    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.progress.value).toBe(0);
    await reportScrollAnswer('42', 500, outgoingAnswer);
    expect(mockHeaderProps.progress.value).toBe(0);
    await selectPage(1);
    await selectPage(0);
    expect(mockHeaderProps.progress.value).toBe(0);
  });

  it('rejects UI writes from a previous scope with the same answer ID after a scope round trip', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    await nativeScrollAnswer('42', 120);
    const originalAnswer = mockAnswerProps.get('42');
    expect(originalAnswer?.scopeVersion).toBeDefined();
    const originalParams = mockParams;
    mockParams = { ...mockParams, sortBy: 'updated' };
    await page.rerender(React.createElement(AnswerDetailScreen));
    const middleAnswer = mockAnswerProps.get('42');
    expect(middleAnswer?.scopeVersion).not.toBe(originalAnswer?.scopeVersion);
    expect(middleAnswer?.activeScopeVersion?.value).toBe(
      middleAnswer?.scopeVersion,
    );
    await nativeScrollAnswer('42', 500, originalAnswer);
    expect(mockHeaderProps.progress.value).toBe(0);
    expect(middleAnswer?.activeScrollY?.value).toBe(0);

    await nativeScrollAnswer('42', 56);
    expect(mockHeaderProps.progress.value).toBe(0.5);
    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    const returnedAnswer = mockAnswerProps.get('42');
    expect(returnedAnswer?.scopeVersion).not.toBe(originalAnswer?.scopeVersion);
    expect(returnedAnswer?.scopeVersion).not.toBe(middleAnswer?.scopeVersion);
    await nativeScrollAnswer('42', 130, originalAnswer);
    await nativeScrollAnswer('42', 68, middleAnswer);
    expect(mockHeaderProps.progress.value).toBe(0);
    expect(returnedAnswer?.activeScrollY?.value).toBe(0);

    await nativeScrollAnswer('42', 56);
    expect(mockHeaderProps.progress.value).toBe(0.5);
    await selectPage(1);
    await selectPage(0);
    expect(mockHeaderProps.progress.value).toBe(0.5);
  });

  it('restores each answer collapse state and updates its compact author together', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await layoutAnswer('42', 140);
    await scrollAnswer('42', 141);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 42');

    await selectPage(1);
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 11');
    await scrollAnswer('11', 300);
    expect(mockHeaderProps.collapsed).toBe(true);
    await scrollAnswer('11', 20);
    expect(mockHeaderProps.collapsed).toBe(false);

    await selectPage(0);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 42');
    await scrollAnswer('42', 120);
    expect(mockHeaderProps.collapsed).toBe(false);
    await selectPage(1);
    expect(mockHeaderProps.collapsed).toBe(false);
    await selectPage(0);
    expect(mockHeaderProps.collapsed).toBe(false);
  });

  it('ignores offscreen scroll events for both the active header and saved answer state', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await scrollAnswer('42', 300);
    await scrollAnswer('11', 400);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 42');

    await selectPage(1);
    expect(mockHeaderProps.collapsed).toBe(false);
    await scrollAnswer('42', 0);
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 11');
    await selectPage(0);
    expect(mockHeaderProps.collapsed).toBe(true);
  });

  it('rejects a delayed outgoing scroll callback without overwriting its saved state', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    const outgoingAnswer = mockAnswerProps.get('42');
    await scrollAnswer('42', 300);
    await selectPage(1);
    await reportScrollAnswer('42', 0, outgoingAnswer);
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 11');

    await selectPage(0);
    expect(mockHeaderProps.collapsed).toBe(true);
  });

  it('keeps the current header through horizontal movement and a canceled swipe', async () => {
    setList(['42', '11']);
    await render(React.createElement(AnswerDetailScreen));
    await scrollAnswer('42', 300);
    await startDrag();
    await scrollPage(0, 0.65);
    await scrollAnswer('11', 0);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 42');

    await scrollState('settling');
    await scrollPage(0, 0);
    await scrollState('idle');
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 42');
    await startDrag();
    await scrollPage(0, 0.5);
    await selectPage(1);
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 11');
  });

  it('preserves collapse state by answer identity when a list refresh changes indexes', async () => {
    setList(['42', '11', '99']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await selectPage(2);
    await scrollAnswer('99', 300);
    const oldPager = mockPagerProps;
    setList(['99', '42', '11']);
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 99');

    await selectPage(2, oldPager);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 99');
    await selectPage(0);
    await startDrag();
    await selectPage(1);
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 42');
    await selectPage(0);
    expect(mockHeaderProps.collapsed).toBe(true);
    expect(mockHeaderProps.author?.name).toBe('作者 99');
  });

  it.each([
    'questionId',
    'sortBy',
  ] as const)('clears header snapshots and rejects old scroll callbacks after a %s change', async (field) => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await scrollAnswer('42', 300);
    const outgoingAnswer = mockAnswerProps.get('42');
    await selectPage(1);
    await scrollAnswer('11', 300);
    const originalParams = mockParams;
    mockParams = {
      ...mockParams,
      [field]: field === 'questionId' ? '8' : 'updated',
    };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 42');
    await reportScrollAnswer('42', 500, outgoingAnswer);
    expect(mockHeaderProps.collapsed).toBe(false);

    // Returning before any new scope scroll must not revive the prior snapshot.
    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.collapsed).toBe(false);
    expect(mockHeaderProps.author?.name).toBe('作者 42');
    await scrollAnswer('42', 100);
    expect(mockHeaderProps.collapsed).toBe(true);
  });

  it('does not revive the previously displayed header when returning to its old pager scope', async () => {
    setList(['42', '11']);
    const page = await render(React.createElement(AnswerDetailScreen));
    await scrollAnswer('42', 300);
    const originalParams = mockParams;
    mockParams = { ...mockParams, sortBy: 'updated' };
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.collapsed).toBe(false);

    mockParams = originalParams;
    await page.rerender(React.createElement(AnswerDetailScreen));
    expect(mockHeaderProps.collapsed).toBe(false);
  });
});

test('routes preview mode to the list and honors its explicit detail escape', async () => {
  mockReadingMode = 'preview-list';
  mockParams = { ...mockParams, sortBy: 'created' };
  const host = await render(React.createElement(AnswerDetailScreen));
  expect(host.getByTestId('answer-preview-list')).toHaveTextContent(
    mockParams.id,
  );
  expect(mockPreviewProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      answerId: mockParams.id,
      questionId: mockParams.questionId,
      sortBy: 'created',
      answerContext: { scene: 'question_feed' },
    }),
  );
  expect(mockPagerMounts).toBe(0);
  mockParams = { ...mockParams, readingMode: 'detail' };
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(host.queryByTestId('answer-preview-list')).toBeNull();
  expect(mockPagerMounts).toBe(1);
});

test('keeps profile navigation across questions and passes its source to both reading modes', async () => {
  mockParams = {
    id: '42',
    questionId: '7',
    title: '入口问题',
    sortBy: 'default',
    answerScene: 'profile_answer',
    memberId: 'member-a',
    memberSort: 'voteups',
  };
  mockAnswerQuestions.set('42', { id: '7', title: '问题一' });
  mockAnswerQuestions.set('11', { id: '8', title: '问题二' });
  mockPages = [
    {
      data: [
        { id: '42', question: { id: '7' } },
        { id: '11', question: { id: '8' } },
      ],
    },
  ];
  const host = await render(React.createElement(AnswerDetailScreen));
  expect(mockPagerSource).toHaveBeenLastCalledWith(
    expect.objectContaining({
      context: {
        scene: 'profile_answer',
        memberId: 'member-a',
        memberSort: 'voteups',
      },
    }),
  );
  expect(mockAnswerProps.get('11')?.questionId).toBe('8');
  expect(mockAnswerProps.get('11')?.initialTitle).toBeUndefined();
  await selectPage(1);
  expect(mockHeaderProps.title).toBe('问题二');
  await act(() => mockHeaderProps.onTitlePress?.());
  expect(mockRouter.push).toHaveBeenLastCalledWith('/question/8');
  expect(mockSetParams).toHaveBeenLastCalledWith({
    id: '11',
    questionId: '8',
    title: undefined,
  });
  const mounts = mockPagerMounts;
  mockParams = { ...mockParams, id: '11', questionId: '8', title: undefined };
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(mockPagerMounts).toBe(mounts);
  expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  mockUnavailableAnswers.add('11');
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(mockHeaderProps.title).toBe('加载中...');
  expect(mockHeaderProps.author).toBeUndefined();
  await act(() => mockHeaderProps.onTitlePress?.());
  expect(mockRouter.push).toHaveBeenLastCalledWith('/question/8');
  mockReadingMode = 'preview-list';
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(mockPreviewProps).toHaveBeenLastCalledWith(
    expect.objectContaining({
      answerId: '11',
      answerContext: {
        scene: 'profile_answer',
        memberId: 'member-a',
        memberSort: 'voteups',
      },
    }),
  );
  await host.unmount();
});

test.each([
  'unknown',
  undefined,
])('uses the question metadata while a swiped answer is loading for %s origin', async (answerScene) => {
  mockParams = { id: '42', questionId: '7', sortBy: 'default', answerScene };
  mockAnswerQuestions.set('42', { id: '7', title: '合成问题' });
  mockUnavailableAnswers.add('11');
  setList(['42', '11']);
  await render(React.createElement(AnswerDetailScreen));
  expect(mockAnswerProps.get('11')?.questionId).toBe('7');
  expect(mockPagerSource).toHaveBeenLastCalledWith(
    expect.objectContaining({ context: { scene: 'unknown' } }),
  );

  await selectPage(1);
  expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
  expect(mockHeaderProps.title).toBe('合成问题');
  await act(() => mockHeaderProps.onTitlePress?.());
  expect(mockRouter.push).toHaveBeenLastCalledWith('/question/7');
  await openHeaderMenu();
  expect(mockHeaderMenuProps.data).toEqual({ id: '7', title: '合成问题' });
});

test('resolves a missing question from the selected answer before the default pager list arrives', async () => {
  mockParams = { id: '42', sortBy: 'default' };
  mockUnavailableAnswers.add('42');
  const host = await render(React.createElement(AnswerDetailScreen));
  expect(mockPagerSource).toHaveBeenLastCalledWith(
    expect.objectContaining({
      questionId: undefined,
      initialAnswer: undefined,
      context: { scene: 'unknown' },
    }),
  );
  expect(mockPagerMounts).toBe(0);

  mockUnavailableAnswers.delete('42');
  mockAnswerQuestions.set('42', { id: 'resolved-question', title: '合成问题' });
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(mockPagerSource).toHaveBeenLastCalledWith(
    expect.objectContaining({ questionId: 'resolved-question' }),
  );
  expect(mockPagerMounts).toBe(1);
  expect(renderedAnswerIds()).toEqual(['42']);

  setList(['11', '99']);
  await host.rerender(React.createElement(AnswerDetailScreen));
  expect(renderedAnswerIds()).toEqual(['42', '11', '99']);
  expect(mockAnswerProps.get('42')?.isFocused).toBe(true);
  expect(mockAnswerMounts.get('42')).toBe(1);
  expect(mockPagerMounts).toBe(1);
  expect(mockAnswerProps.get('11')?.questionId).toBe('resolved-question');
  await startDrag();
  await selectPage(1);
  expect(mockAnswerProps.get('11')?.isFocused).toBe(true);
  expect(mockSetParams).toHaveBeenLastCalledWith({ id: '11' });
});

test.each([
  'unknown',
  undefined,
])('keeps the original %s origin in preview mode without mounting the pager', async (answerScene) => {
  mockReadingMode = 'preview-list';
  mockParams = { ...mockParams, answerScene };
  const host = await render(React.createElement(AnswerDetailScreen));
  expect(host.getByTestId('answer-preview-list')).toHaveTextContent('42');
  expect(mockPreviewProps).toHaveBeenLastCalledWith(
    expect.objectContaining({ answerContext: { scene: 'unknown' } }),
  );
  expect(mockPagerSource).not.toHaveBeenCalled();
  expect(mockPagerMounts).toBe(0);
});
