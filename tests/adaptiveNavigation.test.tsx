import 'react-native-gesture-handler/jestSetup';
import {
  Slot,
  Stack,
  useLocalSearchParams,
  useNavigation,
  usePreventRemove,
} from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import { HeaderShownContext } from 'expo-router/react-navigation';
import {
  act,
  fireEvent,
  renderHook,
  renderRouter,
  screen,
  testRouter,
  waitFor,
  within,
} from 'expo-router/testing-library';
import {
  type ComponentProps,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Dimensions,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewProps,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  addPredictiveBackListener,
  type PredictiveBackEvent,
  predictiveBackSurfaceId,
  releasePredictiveBackSurface,
  setAndroidBackHandlerEnabled,
  setPredictiveBackTarget,
} from '../modules/predictive-back';
import { AdaptiveStack } from '../src/features/adaptive-layout/AdaptiveStack';
import { AndroidBackNavigation } from '../src/features/adaptive-layout/AndroidBackNavigation';
import {
  getListPaneWidth,
  getVisiblePanes,
} from '../src/features/adaptive-layout/layout';
import {
  useFixedHeaderEntryProgress,
  usePaneDimensions,
  usePaneVisible,
} from '../src/features/adaptive-layout/PaneContext';
import * as titleTransition from '../src/features/adaptive-layout/TitleTransition';
import { usePaneRouter } from '../src/features/adaptive-layout/usePaneRouter';
import { usePredictiveBack } from '../src/features/adaptive-layout/usePredictiveBack';
import { useRefreshAction } from '../src/hooks/useRefreshAction';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('../modules/predictive-back', () => ({
  ...jest.requireActual<typeof import('../modules/predictive-back')>(
    '../modules/predictive-back',
  ),
  supportsPredictiveBack: true,
  BackSwipeHost: (props: ViewProps) => {
    const { createElement } =
      jest.requireActual<typeof import('react')>('react');
    const { View } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return createElement(View, {
      ...props,
      testID: `back-host-${props.nativeID}`,
    });
  },
  releasePredictiveBackSurface: jest.fn(),
  addPredictiveBackListener: jest.fn(() => ({ remove: jest.fn() })),
  setPredictiveBackTarget: jest.fn(),
  setAndroidBackHandlerEnabled: jest.fn(),
}));

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
  // The divider's native gesture lifecycle has its own controller tests.
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));

jest.mock('../src/components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    background: '#fff',
    textSecondary: '#666',
    primary: '#08f',
    border: '#ccc',
  }),
}));

const mounts: Record<string, number> = {};
const cleanups: Record<string, number> = {};
let finishRefresh: (() => void) | undefined;
let profileProgress: Animated.Value | undefined;
const profileHeaderStates: boolean[] = [];
let streamProgress: Animated.Value | undefined;
const streamHeaderStates: boolean[] = [];
const confirmLeave = jest.fn();
function ProtectedPage() {
  usePreventRemove(true, confirmLeave);
  return <Text>编辑中</Text>;
}
function Page({ name }: { name: string }) {
  const router = usePaneRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [draft, setDraft] = useState('');
  const [scroll, setScroll] = useState(0);
  const visible = usePaneVisible();
  const entryProgress = useFixedHeaderEntryProgress();
  const headerShown = useContext(HeaderShownContext);
  if (name === 'user') {
    profileProgress = entryProgress;
    profileHeaderStates.push(headerShown);
  }
  if (name === 'stream') {
    streamProgress = entryProgress;
    streamHeaderStates.push(headerShown);
  }
  const { width } = usePaneDimensions();
  const identity = `${name}:${id ?? 'root'}`;
  useEffect(
    () => () => {
      cleanups[identity] = (cleanups[identity] ?? 0) + 1;
    },
    [identity],
  );
  const { refresh, refreshing } = useRefreshAction(
    () =>
      new Promise<void>((resolve) => {
        finishRefresh = resolve;
      }),
  );
  const [instance] = useState(
    () => (mounts[identity] = (mounts[identity] ?? 0) + 1),
  );
  const navigation =
    useNavigation<
      NativeStackNavigationProp<{ 'answer/[id]': { id: string } }>
    >();
  return (
    <View>
      <Stack.Screen
        options={{ headerShown: name === 'header', title: '详情标题' }}
      />
      <Text>{identity}</Text>
      <Text testID={`width-${identity}`}>{width}</Text>
      <Text testID={`visible-${identity}`}>{String(visible)}</Text>
      <TextInput
        testID={`draft-${identity}`}
        value={draft}
        onChangeText={setDraft}
      />
      <Text testID={`instance-${identity}`}>{instance}</Text>
      <ScrollView
        testID={`scroll-${identity}`}
        onScroll={(event) => setScroll(event.nativeEvent.contentOffset.y)}
      >
        <Text testID={`offset-${identity}`}>{scroll}</Text>
      </ScrollView>
      <Text onPress={() => navigation.setParams({ id: 'switched' })}>
        switch-{identity}
      </Text>
      <Text
        onPress={() =>
          navigation.dispatch({
            type: 'GO_BACK',
            target: navigation.getState().key,
          })
        }
      >
        delete-{identity}
      </Text>
      <Text
        onPress={() => {
          void refresh();
        }}
      >
        refresh-{identity}
      </Text>
      <Text testID={`refreshing-${identity}`}>{String(refreshing)}</Text>
      <Text onPress={() => router.push('/answer/a')}>open-a-{identity}</Text>
      <Text onPress={() => router.push('/answer/b')}>open-b-{identity}</Text>
      <Text onPress={() => router.push('/comments/a?type=answer')}>
        comments-{identity}
      </Text>
    </View>
  );
}

async function resize(width: number, height: number) {
  await act(() =>
    Dimensions.set({
      window: { width, height, scale: 1, fontScale: 1 },
      screen: { width, height, scale: 1, fontScale: 1 },
    }),
  );
}

async function setTwoPanes(enabled: boolean) {
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ largeScreenLayoutMode: enabled ? 'dual' : 'single' }),
  );
}

async function open(
  initialUrl = '/',
  defaultHeaders = false,
  routerOverride?: ComponentProps<typeof AdaptiveStack>['UNSTABLE_router'],
) {
  return renderRouter(
    {
      _layout: {
        default: () => (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AdaptiveStack
              screenOptions={{ headerShown: defaultHeaders }}
              UNSTABLE_router={routerOverride}
            >
              <AdaptiveStack.Screen name="(tabs)" options={{ title: '首页' }} />
              <AdaptiveStack.Screen
                name="user/[id]/index"
                options={{ headerShown: false }}
              />
              <AdaptiveStack.Screen
                name="user/[id]/stream"
                options={{ headerShown: false }}
              />
              <AdaptiveStack.Screen
                name="about"
                options={{
                  headerRight: () => (
                    <Text onPress={() => testRouter.back()}>关闭详情</Text>
                  ),
                }}
              />
            </AdaptiveStack>
            <AndroidBackNavigation />
          </GestureHandlerRootView>
        ),
        unstable_settings: { anchor: '(tabs)' },
      },
      '(tabs)/_layout': () => <Slot />,
      '(tabs)/index': () => <Page name="home" />,
      'answer/[id]': () => <Page name="answer" />,
      'user/[id]/index': () => <Page name="user" />,
      'user/[id]/stream': () => <Page name="stream" />,
      'login/index': () => <Page name="login" />,
      'comments/[id]': () => <Page name="comments" />,
      'settings/index': () => <Page name="settings" />,
      'settings/appearance': () => <Page name="appearance" />,
      protected: ProtectedPage,
      'nested/_layout': () => <Stack />,
      'nested/index': () => <Text>nested index</Text>,
      'nested/details': () => <Text>nested details</Text>,
      about: () => <Page name="header" />,
    },
    { initialUrl },
  );
}

function appRoutes(result: Awaited<ReturnType<typeof open>>) {
  const state = result.getRouterState();
  return (
    state?.routes.find((route) => route.name === '__root')?.state?.routes ??
    state?.routes ??
    []
  );
}

beforeEach(async () => {
  // Exercise the adaptive host, which remains the Android single-pane path.
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(35);
  jest.clearAllMocks();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(false);
  for (const key of Object.keys(mounts)) delete mounts[key];
  for (const key of Object.keys(cleanups)) delete cleanups[key];
  finishRefresh = undefined;
  useSettingsStore.setState({
    largeScreenLayoutMode: 'dual',
    androidPredictiveBackEnabled: true,
    largeScreenListRatio: 1 / 3,
  });
  await resize(1200, 800);
});

afterEach(() => jest.restoreAllMocks());

test('layout projection keeps chronological history and never crosses a full-screen boundary', () => {
  const routes = [
    { key: 'home', name: '(tabs)' },
    { key: 'a', name: 'answer/[id]' },
    { key: 'u', name: 'user/[id]/index' },
    { key: 'b', name: 'answer/[id]' },
  ];
  expect(getVisiblePanes(routes, 3, true)).toEqual({
    listKey: 'u',
    detailKey: 'b',
    fullKey: undefined,
  });
  expect(getVisiblePanes(routes, 2, true)).toEqual({
    listKey: 'u',
    detailKey: undefined,
    fullKey: undefined,
  });
  expect(getVisiblePanes(routes, 3, false).fullKey).toBe('b');
  expect(
    getVisiblePanes([...routes, { key: 'login', name: 'login/index' }], 4, true)
      .fullKey,
  ).toBe('login');
  expect(
    getVisiblePanes([{ key: 'login', name: 'login/index' }, routes[1]], 1, true)
      .fullKey,
  ).toBe('a');
});

test('single-pane navigation animates both opening and returning to a mounted page', async () => {
  await setTwoPanes(false);
  const timing = jest.spyOn(Animated, 'timing');
  try {
    await open();
    timing.mockClear();
    await testRouter.push('/answer/a');
    expect(timing).toHaveBeenCalled();
    timing.mockClear();
    await testRouter.back('/');
    expect(timing).toHaveBeenCalled();
    expect(screen.getByTestId('instance-home:root').props.children).toBe(1);
  } finally {
    timing.mockRestore();
  }
});

test.each([false, true])(
  'Android fades an entering page when the title transition is active: %s',
  async (hasTitleTransition) => {
    await setTwoPanes(false);
    jest
      .spyOn(titleTransition, 'useTitleTransitionActiveForRoute')
      .mockReturnValue(hasTitleTransition);
    const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    });
    try {
      const result = await open();
      const homeKey = appRoutes(result)[0].key;
      await testRouter.push('/answer/a');
      const answerKey = appRoutes(result).at(-1)?.key;
      const entering = screen.getByTestId(
        `adaptive-route-${answerKey}-transition`,
      );
      const underneath = screen.getByTestId(`adaptive-route-${homeKey}`, {
        includeHiddenElements: true,
      });
      expect(entering).toBeVisible();
      expect(entering).not.toHaveStyle({ opacity: 1 });
      expect(underneath).toHaveStyle({ opacity: 1 });
      expect(underneath.props.pointerEvents).toBe('none');
      expect(timing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ toValue: 1, useNativeDriver: true }),
      );
    } finally {
      timing.mockRestore();
    }
  },
);

test('reduced-motion back navigation removes the exiting route immediately', async () => {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(true);
  await setTwoPanes(false);
  const result = await open();
  await testRouter.push('/answer/a');
  const answerKey = appRoutes(result).at(-1)?.key;
  await act(async () => {});
  await testRouter.back('/');
  expect(
    screen.queryByTestId(`adaptive-route-${answerKey}`, {
      includeHiddenElements: true,
    }),
  ).toBeNull();
  expect(screen.getByText('home:root')).toBeVisible();
});

test('entering a full-screen page keeps both prior panes under the fade', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const result = await open();
    const listKey = appRoutes(result)[0].key;
    await fireEvent.press(screen.getByText('open-a-home:root'));
    const detailKey = appRoutes(result).at(-1)?.key;
    await testRouter.push('/settings');
    for (const key of [listKey, detailKey]) {
      const pane = screen.getByTestId(`adaptive-route-${key}`, {
        includeHiddenElements: true,
      });
      expect(pane).toHaveStyle({ opacity: 1 });
      expect(pane.props.pointerEvents).toBe('none');
    }
  } finally {
    timing.mockRestore();
  }
});

test('returning from comments keeps the answer stationary and fades out comments', async () => {
  await setTwoPanes(false);
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const result = await open();
    await testRouter.push('/user/u');
    const profileKey = appRoutes(result).at(-1)?.key;
    await testRouter.push('/answer/a');
    const answerKey = appRoutes(result).at(-1)?.key;
    await testRouter.push('/comments/a?type=answer');
    const commentsKey = appRoutes(result).at(-1)?.key;
    timing.mockClear();
    await testRouter.back('/answer/a');
    const profile = screen.getByTestId(`adaptive-route-${profileKey}`, {
      includeHiddenElements: true,
    });
    const answer = screen.getByTestId(`adaptive-route-${answerKey}`);
    const answerTransition = screen.getByTestId(
      `adaptive-route-${answerKey}-transition`,
    );
    // The profile is already drawn underneath for the next back gesture.
    expect(profile).toHaveStyle({ opacity: 1 });
    expect(profile.props.pointerEvents).toBe('none');
    expect(answer).toHaveStyle({ opacity: 1 });
    expect(answerTransition).toHaveStyle({ opacity: 1 });
    const comments = screen.getByTestId(`adaptive-route-${commentsKey}`, {
      includeHiddenElements: true,
    });
    expect(comments.props.pointerEvents).toBe('none');
    expect(timing).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 0, useNativeDriver: true }),
    );
    expect(screen.getByText('answer:a')).toBeVisible();
  } finally {
    timing.mockRestore();
  }
});

test('closing a detail does not fade the list pane or leave it partly transparent', async () => {
  const timing = jest.spyOn(Animated, 'timing').mockReturnValue({
    start: jest.fn(),
    stop: jest.fn(),
    reset: jest.fn(),
  });
  try {
    const result = await open();
    const listKey = appRoutes(result)[0].key;
    await fireEvent.press(screen.getByText('open-a-home:root'));
    await testRouter.back('/');
    expect(screen.getByTestId(`adaptive-route-${listKey}`)).toHaveStyle({
      opacity: 1,
    });
  } finally {
    timing.mockRestore();
  }
});

test('opening a profile does not move or scale the whole page', async () => {
  await setTwoPanes(false);
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const result = await open();
    timing.mockClear();
    await testRouter.push('/user/u');
    const key = appRoutes(result).at(-1)?.key;
    expect(key).toBeDefined();
    const profile = screen.getByTestId(`adaptive-route-${key}-transition`);
    expect(StyleSheet.flatten(profile.props.style).transform).toBeUndefined();
    expect(profileProgress).toBeDefined();
    expect(timing.mock.calls.some(([value]) => value === profileProgress)).toBe(
      true,
    );
  } finally {
    timing.mockRestore();
  }
});

test('recent publications start without a default header and use the fixed-toolbar transition', async () => {
  await setTwoPanes(false);
  streamProgress = undefined;
  streamHeaderStates.length = 0;
  const timing = jest.spyOn(Animated, 'timing');
  try {
    const result = await open('/', true);
    await testRouter.push('/user/u/stream');
    const key = appRoutes(result).at(-1)?.key;
    const route = screen.getByTestId(`adaptive-route-${key}-transition`);
    expect(streamHeaderStates.length).toBeGreaterThan(0);
    expect(streamHeaderStates.every((shown) => !shown)).toBe(true);
    expect(StyleSheet.flatten(route.props.style).transform).toBeUndefined();
    expect(streamProgress).toBeDefined();
    expect(timing.mock.calls.some(([value]) => value === streamProgress)).toBe(
      true,
    );
  } finally {
    timing.mockRestore();
  }
});

test('profile never receives a default header even on its first render', async () => {
  await setTwoPanes(false);
  profileHeaderStates.length = 0;
  await open('/', true);
  await testRouter.push('/user/u');
  expect(profileHeaderStates.length).toBeGreaterThan(0);
  expect(profileHeaderStates.every((shown) => !shown)).toBe(true);
});

test('rotation preserves route keys, draft state and full back order across both panes', async () => {
  const result = await open();
  await testRouter.push('/answer/a');
  await fireEvent.changeText(screen.getByTestId('draft-answer:a'), 'reading a');
  await fireEvent.scroll(screen.getByTestId('scroll-answer:a'), {
    nativeEvent: { contentOffset: { x: 0, y: 1234 } },
  });
  await testRouter.push('/user/u');
  expect(screen.queryByText('answer:a')).toBeNull();
  expect(screen.getByText('user:u')).toBeVisible();
  await testRouter.push('/answer/b');
  await fireEvent.changeText(screen.getByTestId('draft-answer:b'), 'reading b');
  const keys = appRoutes(result).map((route) => route.key);
  await resize(800, 1200);
  expect(screen.getByTestId('draft-answer:b').props.value).toBe('reading b');
  expect(screen.getByText('user:u')).toBeVisible();
  expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
  await resize(1200, 800);
  expect(screen.getByText('user:u')).toBeVisible();
  expect(screen.getByTestId('draft-answer:b').props.value).toBe('reading b');
  await testRouter.back('/user/u');
  await testRouter.back('/answer/a');
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('reading a');
  expect(screen.getByTestId('offset-answer:a').props.children).toBe(1234);
  expect(screen.getByTestId('instance-answer:a').props.children).toBe(1);
  expect(cleanups['answer:a']).toBeUndefined();
  await testRouter.back();
  expect(result.getPathname()).toBe('/');
  expect(screen.getByText('home:root')).toBeVisible();
});

test('a covered pane keeps its effects and geometry and completes an in-flight refresh', async () => {
  useSettingsStore.setState({ androidPredictiveBackEnabled: false });
  await open();
  const width = screen.getByTestId('width-home:root').props.children;
  await fireEvent.press(screen.getByText('refresh-home:root'));
  expect(screen.getByTestId('refreshing-home:root').props.children).toBe(
    'true',
  );
  await testRouter.push('/answer/a');
  await setTwoPanes(false);
  await resize(800, 1200);
  expect(
    screen.getByTestId('width-home:root', { includeHiddenElements: true }).props
      .children,
  ).toBe(width);
  await act(() => finishRefresh?.());
  await resize(1200, 800);
  await setTwoPanes(true);
  expect(screen.getByTestId('refreshing-home:root').props.children).toBe(
    'false',
  );
  expect(cleanups['home:root']).toBeUndefined();
});

test('a pending deletion removes its own detail and preserves the newer list', async () => {
  const result = await open();
  await testRouter.push('/answer/a');
  const finishDelete = screen.getByText('delete-answer:a').props.onPress;
  await testRouter.push('/user/u');
  const userKey = appRoutes(result).at(-1)?.key;
  await act(() => finishDelete());
  expect(result.getPathname()).toBe('/user/u');
  expect(appRoutes(result).at(-1)?.key).toBe(userKey);
  expect(
    screen.queryByText('answer:a', { includeHiddenElements: true }),
  ).toBeNull();
  await testRouter.back('/');
});

test.each([false, true])(
  'ordinary system Back consumes just one entry and leaves the root unhandled (dual panes %s)',
  async (dual) => {
    const listener = jest.spyOn(BackHandler, 'addEventListener');
    try {
      await setTwoPanes(dual);
      const result = await open();
      jest.runAllTicks();
      expect(jest.mocked(setAndroidBackHandlerEnabled).mock.lastCall?.[0]).toBe(
        false,
      );
      const onBack = listener.mock.calls.find(
        ([event]) => event === 'hardwareBackPress',
      )?.[1];
      expect(onBack).toBeDefined();
      await testRouter.push('/answer/a');
      jest.runAllTicks();
      expect(jest.mocked(setAndroidBackHandlerEnabled).mock.lastCall?.[0]).toBe(
        true,
      );
      await testRouter.push('/user/u');
      await resize(800, 1200);
      await act(() => {
        expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(
          true,
        );
      });
      expect(result.getPathname()).toBe('/answer/a');
      await resize(1200, 800);
      await act(() => {
        expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(
          true,
        );
      });
      expect(result.getPathname()).toBe('/');
      jest.runAllTicks();
      expect(jest.mocked(setAndroidBackHandlerEnabled).mock.lastCall?.[0]).toBe(
        false,
      );
      await act(() => {
        expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(
          false,
        );
      });
    } finally {
      listener.mockRestore();
    }
  },
);

function currentGesture() {
  const listener = jest.mocked(addPredictiveBackListener).mock.lastCall?.[0];
  const routeKey = jest.mocked(setPredictiveBackTarget).mock.lastCall?.[0];
  if (!routeKey || !listener)
    throw new Error('No active predictive back target');
  return (phase: PredictiveBackEvent['phase'], gestureId: number) =>
    act(() => listener({ phase, gestureId, routeKey }));
}

test('at the root the setting enables the system home preview only while using one pane', async () => {
  await setTwoPanes(false);
  await open();
  jest.runAllTicks();
  expect(setAndroidBackHandlerEnabled).toHaveBeenLastCalledWith(false, true);
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: false }),
  );
  jest.runAllTicks();
  expect(setAndroidBackHandlerEnabled).toHaveBeenLastCalledWith(false, false);
  await setTwoPanes(true);
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: true }),
  );
  jest.runAllTicks();
  expect(setAndroidBackHandlerEnabled).toHaveBeenLastCalledWith(false, false);
  await setTwoPanes(false);
  jest.runAllTicks();
  expect(setAndroidBackHandlerEnabled).toHaveBeenLastCalledWith(false, true);
  expect(setPredictiveBackTarget).not.toHaveBeenCalled();
});

test('single-pane Back prepares an inactive destination and retains the source until its native exit finishes', async () => {
  const result = await open();
  expect(setPredictiveBackTarget).not.toHaveBeenCalled();
  await testRouter.push('/answer/a');
  const narrowWidth = screen.getByTestId('width-answer:a').props.children;
  await fireEvent.scroll(screen.getByTestId('scroll-answer:a'), {
    nativeEvent: { contentOffset: { x: 0, y: 823 } },
  });
  await testRouter.push('/comments/a?type=answer');
  await setTwoPanes(false);
  const [, answer, comments] = appRoutes(result);
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(comments.key);
  const gesture = currentGesture();
  expect(
    screen.getByTestId(`adaptive-route-${answer.key}`, {
      includeHiddenElements: true,
    }).props.pointerEvents,
  ).toBe('none');
  expect(
    screen.getByTestId('visible-answer:a', { includeHiddenElements: true })
      .props.children,
  ).toBe('false');
  expect(
    screen.getByTestId('width-answer:a', { includeHiddenElements: true }).props
      .children,
  ).toBeGreaterThan(narrowWidth);
  expect(result.getPathname()).toBe('/comments/a');
  const timing = jest.spyOn(Animated, 'timing');
  await gesture('commit', 2);
  // The mock never delivers animation-completion callbacks. History still
  // changes immediately, with the old page retained just for its visual exit.
  expect(result.getPathname()).toBe('/answer/a');
  expect(timing).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ toValue: 0 }),
  );
  await gesture('commit', 2);
  expect(appRoutes(result)).toHaveLength(2);
  const outgoing = () =>
    screen.queryByTestId(`adaptive-route-${comments.key}`, {
      includeHiddenElements: true,
    });
  expect(outgoing()?.props.pointerEvents).toBe('none');
  expect(
    screen.getByTestId('visible-comments:a', { includeHiddenElements: true })
      .props.children,
  ).toBe('false');
  await gesture('finish', 1);
  expect(outgoing()).not.toBeNull();
  await gesture('finish', 2);
  expect(outgoing()).toBeNull();
  expect(releasePredictiveBackSurface).not.toHaveBeenCalled();
  expect(screen.getByTestId('offset-answer:a').props.children).toBe(823);
  expect(screen.getByTestId('instance-answer:a').props.children).toBe(1);
});

test('the native host contains the header and body, and only the eligible foreground route is targeted', async () => {
  await setTwoPanes(false);
  const result = await open();
  await testRouter.push('/about');
  const [home, about] = appRoutes(result);
  if (!home.key || !about.key) throw new Error('Missing mounted route keys');
  const surfaces = (key: string) =>
    screen.container.queryAll(
      (node) => node.props.nativeID === predictiveBackSurfaceId(key),
    );
  expect(surfaces(about.key)).toHaveLength(1);
  expect(surfaces(home.key)).toHaveLength(1);
  const foreground = surfaces(about.key)[0];
  expect(foreground.props.testID).toBe(
    `back-host-${predictiveBackSurfaceId(about.key)}`,
  );
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(about.key);
  expect(setPredictiveBackTarget).not.toHaveBeenCalledWith(home.key);
  expect(foreground.props.collapsable).toBe(false);
  expect(within(foreground).getByText('详情标题')).toBeVisible();
  expect(within(foreground).getByText('header:root')).toBeVisible();
  expect(StyleSheet.flatten(foreground.props.style).opacity).toBeUndefined();
  expect(StyleSheet.flatten(foreground.props.style).transform).toBeUndefined();
  await fireEvent.changeText(screen.getByTestId('draft-header:root'), '未发送');
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: false }),
  );
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(null);
  const sameHost = surfaces(about.key)[0];
  expect(sameHost).toBe(foreground);
  expect(within(sameHost).getByDisplayValue('未发送')).toBeVisible();
  expect(screen.getByTestId('instance-header:root').props.children).toBe(1);
});

test('the settings content area can swipe Back while answers reserve it for horizontal paging', async () => {
  await setTwoPanes(false);
  const result = await open();
  const surface = (routeKey: string) =>
    screen.getByTestId(`back-host-${predictiveBackSurfaceId(routeKey)}`, {
      includeHiddenElements: true,
    });
  const currentKey = () => {
    const key = appRoutes(result).at(-1)?.key;
    if (!key) throw new Error('Missing current route');
    return key;
  };
  await testRouter.push('/settings');
  const settings = currentKey();
  expect(surface(settings).props.allowContentSwipe).toBe(true);
  await testRouter.push('/settings/appearance');
  const appearance = currentKey();
  expect(surface(appearance).props.allowContentSwipe).toBe(true);
  expect(surface(settings).props.allowContentSwipe).toBe(false);
  await setTwoPanes(true);
  expect(surface(appearance).props.allowContentSwipe).toBe(false);
  await setTwoPanes(false);
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: false }),
  );
  expect(surface(appearance).props.allowContentSwipe).toBe(false);
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: true }),
  );
  await testRouter.push('/answer/a');
  const answer = currentKey();
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(answer);
  expect(surface(answer).props.allowContentSwipe).toBe(false);
  await testRouter.back('/settings/appearance');
  expect(surface(appearance).props.allowContentSwipe).toBe(true);
});

test.each([
  { version: 33, reducedMotion: false },
  { version: 35, reducedMotion: true },
])(
  'API $version with reduced motion $reducedMotion uses ordinary Back',
  async ({ version, reducedMotion }) => {
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(version);
    jest
      .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
      .mockResolvedValue(reducedMotion);
    await setTwoPanes(false);
    const result = await open();
    await testRouter.push('/answer/a');
    expect(setPredictiveBackTarget).not.toHaveBeenCalled();
    await testRouter.back('/');
    expect(result.getPathname()).toBe('/');
  },
);

test('an eligible deep link uses ordinary hardware Back until reduced motion is confirmed off', async () => {
  const preference = Promise.withResolvers<boolean>();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockReturnValue(preference.promise);
  const hardwareBack = jest.spyOn(BackHandler, 'addEventListener');
  await setTwoPanes(false);
  const result = await open('/answer/a');
  const answer = appRoutes(result).at(-1);
  await testRouter.push('/comments/a?type=answer');
  expect(setPredictiveBackTarget).not.toHaveBeenCalled();
  const handler = hardwareBack.mock.calls.find(
    ([name]) => name === 'hardwareBackPress',
  )?.[1];
  await act(() => {
    expect(handler?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
  });
  expect(result.getPathname()).toBe('/answer/a');
  expect(setPredictiveBackTarget).not.toHaveBeenCalled();
  await act(() => preference.resolve(false));
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(answer?.key);
});

test('a newer reduced-motion event takes priority over a pending initial read', async () => {
  const preference = Promise.withResolvers<boolean>();
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockReturnValue(preference.promise);
  const subscriptions = jest.spyOn(AccessibilityInfo, 'addEventListener');
  await setTwoPanes(false);
  const result = await open('/answer/a');
  const answer = appRoutes(result).at(-1);
  const changes = subscriptions.mock.calls.filter(
    ([name]) => name === 'reduceMotionChanged',
  );
  const change = (enabled: boolean) => {
    for (const [, listener] of changes) listener(enabled);
  };
  await act(() => change(true));
  await act(() => preference.resolve(false));
  expect(setPredictiveBackTarget).not.toHaveBeenCalled();
  await act(() => change(false));
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(answer?.key);
});

test('changing layout or disabling the setting cancels the preview before a late commit', async () => {
  await setTwoPanes(false);
  const result = await open('/answer/a');
  const answer = appRoutes(result).at(-1);
  const gesture = currentGesture();
  await setTwoPanes(true);
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(null);
  await gesture('commit', 1);
  expect(result.getPathname()).toBe('/answer/a');
  await setTwoPanes(false);
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(answer?.key);
  const next = currentGesture();
  await act(() =>
    useSettingsStore.setState({ androidPredictiveBackEnabled: false }),
  );
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(null);
  await next('commit', 2);
  expect(releasePredictiveBackSurface).toHaveBeenCalledWith(2);
  expect(result.getPathname()).toBe('/answer/a');
  await testRouter.back();
  expect(result.getPathname()).toBe('/');
});

test('a finish restores the native surface when a router guard kept the source active', async () => {
  const pop = jest.fn();
  const finish = jest.fn();
  await renderHook(() =>
    usePredictiveBack(
      'editor',
      'home',
      [{ key: 'home' }, { key: 'editor' }],
      pop,
      finish,
    ),
  );
  const gesture = currentGesture();
  await gesture('commit', 9);
  expect(pop).toHaveBeenCalledWith(1, 'editor');
  await gesture('finish', 9);
  expect(releasePredictiveBackSurface).toHaveBeenCalledWith(9);
  expect(finish).not.toHaveBeenCalled();
  await gesture('commit', 9);
  expect(pop).toHaveBeenCalledTimes(1);
});

test('a rejected pop restores the source even when a new route covers it before finish', async () => {
  let guardedKey: string | undefined;
  await setTwoPanes(false);
  const result = await open('/answer/a', false, (original) => ({
    getStateForAction(state, action, options) {
      if (action.type === 'POP' && action.source === guardedKey)
        return { state, affectedRouteKey: guardedKey };
      return original.getStateForAction(state, action, options);
    },
  }));
  guardedKey = appRoutes(result).at(-1)?.key;
  const sourceGesture = currentGesture();
  await sourceGesture('commit', 12);
  expect(result.getPathname()).toBe('/answer/a');
  await testRouter.push('/settings/appearance');
  expect(appRoutes(result).some((route) => route.key === guardedKey)).toBe(
    true,
  );
  await sourceGesture('finish', 12);
  expect(releasePredictiveBackSurface).toHaveBeenCalledTimes(1);
  expect(releasePredictiveBackSurface).toHaveBeenCalledWith(12);
  expect(result.getPathname()).toBe('/settings/appearance');
  await testRouter.back('/answer/a');
  expect(screen.getByText('answer:a')).toBeVisible();
});

test('only a commit can navigate even if an older native event reaches the router', async () => {
  await setTwoPanes(false);
  const result = await open('/answer/a');
  const gesture = currentGesture();
  for (const phase of ['start', 'progress', 'cancel'] as const) {
    // @ts-expect-error Simulate the older native binary sending an untyped event.
    await gesture(phase, 1);
    expect(result.getPathname()).toBe('/answer/a');
  }
  await gesture('commit', 2);
  expect(result.getPathname()).toBe('/');
});

test('protected editors and nested navigators retain their standard Back handling', async () => {
  const hardwareBack = jest.spyOn(BackHandler, 'addEventListener');
  await setTwoPanes(false);
  const result = await open('/answer/a');
  await testRouter.push('/protected');
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(null);
  const handler = hardwareBack.mock.calls.find(
    ([event]) => event === 'hardwareBackPress',
  )?.[1];
  await act(() => {
    expect(handler?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
  });
  expect(confirmLeave).toHaveBeenCalledTimes(1);
  expect(result.getPathname()).toBe('/protected');
  await testRouter.push('/nested');
  await testRouter.push('/nested/details');
  expect(setPredictiveBackTarget).toHaveBeenLastCalledWith(null);
  jest.runAllTicks();
  expect(jest.mocked(setAndroidBackHandlerEnabled).mock.lastCall?.[0]).toBe(
    true,
  );
  await testRouter.back('/nested');
});

test('starting with panes disabled, resizing and changing preferences retain the same page', async () => {
  await resize(800, 1200);
  await setTwoPanes(false);
  const result = await open('/answer/a');
  await fireEvent.changeText(screen.getByTestId('draft-answer:a'), 'saved');
  const keys = appRoutes(result).map((route) => route.key);
  await resize(1200, 800);
  expect(screen.queryByTestId('adaptive-divider')).toBeNull();
  await setTwoPanes(true);
  const previousWidth = screen.getByTestId('width-answer:a').props.children;
  await fireEvent(
    screen.getByTestId('adaptive-divider'),
    'accessibilityAction',
    { nativeEvent: { actionName: 'increment' } },
  );
  expect(screen.getByTestId('width-answer:a').props.children).toBeLessThan(
    previousWidth,
  );
  expect(useSettingsStore.getState().largeScreenListRatio).toBeGreaterThan(
    1 / 3,
  );
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ largeScreenLayoutMode: 'single' }),
  );
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
  expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ largeScreenLayoutMode: 'dual' }),
  );
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
  await testRouter.back();
  expect(result.getPathname()).toBe('/');
});

test('late detail parameter updates target their own route and full-screen back restores the current selection', async () => {
  const result = await open();
  await testRouter.push('/answer/a');
  const finishSwitch = screen.getByText('switch-answer:a').props.onPress;
  await testRouter.push('/user/u');
  await act(() => finishSwitch());
  expect(result.getPathname()).toBe('/user/u');
  expect(
    appRoutes(result).find((route) => route.name === 'answer/[id]')?.params,
  ).toMatchObject({ id: 'switched' });
  await testRouter.push('/login');
  expect(screen.queryByText('user:u')).toBeNull();
  await testRouter.back('/user/u');
  expect(screen.getByText('user:u')).toBeVisible();
  expect(screen.queryByText('answer:switched')).toBeNull();
  await testRouter.back('/answer/switched');
  expect(screen.getByText('answer:switched')).toBeVisible();
});

test('hiding the pane with input focus dismisses its keyboard without clearing the draft', async () => {
  const dismiss = jest.spyOn(Keyboard, 'dismiss');
  try {
    const result = await open();
    const homeKey = appRoutes(result)[0].key;
    await fireEvent.changeText(
      screen.getByTestId('draft-home:root'),
      'search draft',
    );
    await fireEvent(
      screen.getByTestId(`adaptive-route-${homeKey}`),
      'focusCapture',
    );
    await testRouter.push('/answer/a');
    expect(dismiss).not.toHaveBeenCalled();
    await resize(800, 1200);
    expect(dismiss).not.toHaveBeenCalled();
    await setTwoPanes(false);
    expect(dismiss).toHaveBeenCalledTimes(1);
    await resize(1200, 800);
    await setTwoPanes(true);
    expect(screen.getByTestId('draft-home:root').props.value).toBe(
      'search draft',
    );
  } finally {
    dismiss.mockRestore();
  }
});

test('the adaptive header keeps its back button usable after rotating a full-screen route', async () => {
  const result = await open();
  await testRouter.push('/about');
  expect(screen.getByText('详情标题')).toBeVisible();
  await resize(800, 1200);
  await fireEvent.press(screen.getByLabelText('返回'));
  await waitFor(() => expect(result.getPathname()).toBe('/'));
});

test('the adaptive navigator applies controls declared on root Stack.Screen options', async () => {
  const result = await open();
  await testRouter.push('/about');
  await fireEvent.press(screen.getByText('关闭详情'));
  await waitFor(() => expect(result.getPathname()).toBe('/'));
});

test.each([
  [320, 700],
  [390, 844],
  [700, 390],
  [800, 1200],
  [1200, 800],
])(
  'forced layout choices apply at %s by %s without remounting pages',
  async (width, height) => {
    await resize(width, height);
    const result = await open();
    await fireEvent.changeText(screen.getByTestId('draft-home:root'), 'filter');
    await fireEvent.press(screen.getByText('open-a-home:root'));
    await fireEvent.changeText(screen.getByTestId('draft-answer:a'), 'saved');
    const keys = appRoutes(result).map((route) => route.key);
    expect(screen.getByTestId('adaptive-divider')).toBeVisible();
    const detailWidth = screen.getByTestId('width-answer:a').props.children;
    expect(detailWidth).toBeGreaterThan(0);
    expect(detailWidth).toBeLessThan(width);
    await fireEvent(
      screen.getByTestId('adaptive-divider'),
      'accessibilityAction',
      {
        nativeEvent: { actionName: 'increment' },
      },
    );
    expect(screen.getByTestId('width-answer:a').props.children).toBeLessThan(
      detailWidth,
    );
    await resize(height, width);
    expect(screen.getByTestId('adaptive-divider')).toBeVisible();
    await setTwoPanes(false);
    expect(screen.queryByTestId('adaptive-divider')).toBeNull();
    expect(screen.queryByText('home:root')).toBeNull();
    expect(screen.getByTestId('width-answer:a').props.children).toBe(height);
    await resize(width, height);
    expect(screen.queryByTestId('adaptive-divider')).toBeNull();
    await setTwoPanes(true);
    expect(screen.getByTestId('adaptive-divider')).toBeVisible();
    expect(screen.getByTestId('draft-home:root').props.value).toBe('filter');
    expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
    expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
    expect(mounts['answer:a']).toBe(1);
    expect(cleanups['answer:a']).toBeUndefined();
    await testRouter.back('/');
  },
);

test('automatic layout follows available window width without resetting the selection or drafts', async () => {
  useSettingsStore.setState({ largeScreenLayoutMode: 'auto' });
  await resize(1200, 800);
  const result = await open();
  expect(screen.getByTestId('adaptive-empty-detail')).toBeVisible();
  await fireEvent.press(screen.getByText('open-a-home:root'));
  await fireEvent.changeText(screen.getByTestId('draft-answer:a'), 'saved');
  const keys = appRoutes(result).map((route) => route.key);

  await resize(600, 800);
  expect(screen.queryByTestId('adaptive-divider')).toBeNull();
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
  await resize(1200, 800);
  expect(screen.getByTestId('adaptive-divider')).toBeVisible();
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
  expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
});

test.each([320, 390, 700, 1200])(
  'both panes remain within width %s at every divider limit',
  (width) => {
    const widths = [-1, 1 / 3, 0.45, 1, Number.NaN].map((ratio) =>
      getListPaneWidth(width, ratio),
    );
    for (const listWidth of widths) {
      expect(listWidth).toBeGreaterThan(0);
      expect(width - 16 - listWidth).toBeGreaterThan(0);
    }
    expect(widths[3]).toBeGreaterThan(widths[0]);
  },
);

test.each([
  [390, 844],
  [1200, 800],
])(
  'settings remain full screen at %s by %s and returning restores the selected detail',
  async (width, height) => {
    await resize(width, height);
    const result = await open();
    await fireEvent.press(screen.getByText('open-a-home:root'));
    const keys = appRoutes(result).map((route) => route.key);
    await testRouter.push('/settings');
    expect(screen.getByTestId('width-settings:root').props.children).toBe(
      width,
    );
    expect(screen.queryByTestId('adaptive-divider')).toBeNull();
    await testRouter.push('/settings/appearance');
    expect(screen.getByTestId('width-appearance:root').props.children).toBe(
      width,
    );
    expect(screen.queryByText('answer:a')).toBeNull();
    await setTwoPanes(false);
    await testRouter.back('/settings');
    await testRouter.back('/answer/a?readingMode=detail');
    expect(screen.getByTestId('width-answer:a').props.children).toBe(width);
    await setTwoPanes(true);
    expect(screen.getByText('home:root')).toBeVisible();
    expect(screen.getByText('answer:a')).toBeVisible();
    expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
  },
);

test('wide list selections replace the open detail, retain a reselected page, and close after nested back', async () => {
  const result = await open();
  await fireEvent.changeText(
    screen.getByTestId('draft-home:root'),
    'list filter',
  );
  await fireEvent.press(screen.getByText('open-a-home:root'));
  const firstKey = appRoutes(result).at(-1)?.key;
  expect(appRoutes(result).at(-1)?.params).toMatchObject({
    id: 'a',
    readingMode: 'detail',
  });
  await fireEvent.changeText(
    screen.getByTestId('draft-answer:a'),
    'answer draft',
  );
  await fireEvent.press(screen.getByText('open-a-home:root'));
  expect(appRoutes(result).at(-1)?.key).toBe(firstKey);
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('answer draft');
  await fireEvent.press(screen.getByText('comments-answer:a'));
  expect(appRoutes(result)).toHaveLength(3);
  await fireEvent.press(screen.getByText('open-b-home:root'));
  expect(appRoutes(result)).toHaveLength(2);
  expect(screen.getByText('answer:b')).toBeVisible();
  expect(
    appRoutes(result).some((route) => route.name.startsWith('comments/')),
  ).toBe(false);
  const selectedKey = appRoutes(result).at(-1)?.key;
  await resize(800, 1200);
  await resize(1200, 800);
  expect(appRoutes(result).at(-1)?.key).toBe(selectedKey);
  await fireEvent.press(screen.getByText('comments-answer:b'));
  await testRouter.back('/answer/b?readingMode=detail');
  await testRouter.back('/');
  expect(screen.getByTestId('adaptive-empty-detail')).toBeVisible();
  expect(screen.getByTestId('draft-home:root').props.value).toBe('list filter');
});
