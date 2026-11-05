import 'react-native-gesture-handler/jestSetup';
import { Slot, Stack, useLocalSearchParams, useNavigation } from 'expo-router';
import type { NativeStackNavigationProp } from 'expo-router/native-stack';
import { HeaderShownContext } from 'expo-router/react-navigation';
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
} from 'expo-router/testing-library';
import { type ReactNode, useContext, useEffect, useState } from 'react';
import {
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
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AdaptiveStack } from '../src/features/adaptive-layout/AdaptiveStack';
import {
  getListPaneWidth,
  getVisiblePanes,
} from '../src/features/adaptive-layout/layout';
import {
  useFixedHeaderEntryProgress,
  usePaneDimensions,
  usePaneVisible,
} from '../src/features/adaptive-layout/PaneContext';
import { usePaneRouter } from '../src/features/adaptive-layout/usePaneRouter';
import { useRefreshAction } from '../src/hooks/useRefreshAction';
import { useSettingsStore } from '../src/store/useSettingsStore';

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
      .updateSettings({ enableLargeScreenLayout: enabled }),
  );
}

async function open(initialUrl = '/', defaultHeaders = false) {
  return renderRouter(
    {
      _layout: {
        default: () => (
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AdaptiveStack screenOptions={{ headerShown: defaultHeaders }}>
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
  for (const key of Object.keys(mounts)) delete mounts[key];
  for (const key of Object.keys(cleanups)) delete cleanups[key];
  finishRefresh = undefined;
  useSettingsStore.setState({
    enableLargeScreenLayout: true,
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

test('returning from comments keeps the older profile hidden throughout the answer entrance', async () => {
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
    await testRouter.back('/answer/a');
    const profile = screen.getByTestId(`adaptive-route-${profileKey}`, {
      includeHiddenElements: true,
    });
    const answer = screen.getByTestId(`adaptive-route-${answerKey}`);
    const answerTransition = screen.getByTestId(
      `adaptive-route-${answerKey}-transition`,
    );
    expect(profile).toHaveStyle({ opacity: 0 });
    expect(answer).toHaveStyle({ opacity: 1 });
    expect(answerTransition).not.toHaveStyle({ opacity: 1 });
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

test('system back consumes one chronological entry per press and leaves root unhandled', async () => {
  const listener = jest.spyOn(BackHandler, 'addEventListener');
  try {
    const result = await open();
    const onBack = listener.mock.calls.find(
      ([event]) => event === 'hardwareBackPress',
    )?.[1];
    expect(onBack).toBeDefined();
    await testRouter.push('/answer/a');
    await testRouter.push('/user/u');
    await resize(800, 1200);
    await act(() => {
      expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
    });
    expect(result.getPathname()).toBe('/answer/a');
    await resize(1200, 800);
    await act(() => {
      expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(true);
    });
    expect(result.getPathname()).toBe('/');
    await act(() => {
      expect(onBack?.({ type: 'hardwareBackPress', timeStamp: 1 })).toBe(false);
    });
  } finally {
    listener.mockRestore();
  }
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
      .updateSettings({ enableLargeScreenLayout: false }),
  );
  expect(screen.getByTestId('draft-answer:a').props.value).toBe('saved');
  expect(appRoutes(result).map((route) => route.key)).toEqual(keys);
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ enableLargeScreenLayout: true }),
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
  'only the switch controls panes at %s by %s without remounting pages',
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
