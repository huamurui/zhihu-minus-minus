import 'react-native-gesture-handler/jestSetup';
import { Slot, useLocalSearchParams, usePreventRemove } from 'expo-router';
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  testRouter,
} from 'expo-router/testing-library';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AdaptiveStack } from '../src/features/adaptive-layout/AdaptiveStack';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('react-native-gesture-handler', () => ({
  ...jest.requireActual('react-native-gesture-handler'),
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

const blocked = jest.fn();
function Answer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>answer {id}</Text>;
}
function Protected() {
  usePreventRemove(true, blocked);
  return <Text>protected</Text>;
}

async function open() {
  useSettingsStore.setState({ enableLargeScreenLayout: false });
  return renderRouter({
    _layout: {
      default: () => (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AdaptiveStack screenOptions={{ headerShown: false }} />
        </GestureHandlerRootView>
      ),
      unstable_settings: { anchor: '(tabs)' },
    },
    '(tabs)/_layout': () => <Slot />,
    '(tabs)/index': () => <Text>home</Text>,
    'answer/[id]': Answer,
    protected: Protected,
  });
}

function routes(result: Awaited<ReturnType<typeof open>>) {
  const root = result.getRouterState();
  return (
    root?.routes.find((route) => route.name === '__root')?.state?.routes ??
    root?.routes ??
    []
  );
}

function nativeScreen(key: string) {
  const item = screen.container.queryAll(
    (node) => node.type === 'RNSScreen' && node.props.screenId === key,
  )[0];
  if (!item) throw new Error('Native screen not found');
  return item;
}

beforeEach(() => blocked.mockClear());

test('iOS single pane uses a native screen and a native dismissal updates the shared history', async () => {
  const result = await open();
  await testRouter.push('/answer/a');
  const key = routes(result).at(-1)?.key;
  if (!key) throw new Error('Missing answer route');
  const item = nativeScreen(key);
  expect(item.props.stackPresentation).toBe('push');
  expect(item.props.gestureEnabled).not.toBe(false);
  await fireEvent(item, 'dismissed', { nativeEvent: { dismissCount: 1 } });
  expect(routes(result).some((route) => route.key === key)).toBe(false);
  expect(screen.getByText('home')).toBeVisible();
});

test('iOS layout changes preserve route identities and back order while switching views', async () => {
  const result = await open();
  await testRouter.push('/answer/a');
  await testRouter.push('/answer/b');
  const before = routes(result).map(({ key, name, params }) => ({
    key,
    name,
    params,
  }));
  expect(nativeScreen(before.at(-1)?.key ?? '')).toBeTruthy();
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ enableLargeScreenLayout: true }),
  );
  expect(screen.getByTestId('adaptive-stack')).toBeVisible();
  expect(
    routes(result).map(({ key, name, params }) => ({ key, name, params })),
  ).toEqual(before);
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ enableLargeScreenLayout: false }),
  );
  expect(nativeScreen(before.at(-1)?.key ?? '')).toBeTruthy();
  expect(
    routes(result).map(({ key, name, params }) => ({ key, name, params })),
  ).toEqual(before);
  await testRouter.back();
  expect(screen.getByText('answer a')).toBeVisible();
});

test('native dismissal respects removal prevention', async () => {
  const result = await open();
  await testRouter.push('/protected');
  const key = routes(result).at(-1)?.key;
  if (!key) throw new Error('Missing protected route');
  const item = nativeScreen(key);
  expect(item.props.preventNativeDismiss).toBe(true);
  await fireEvent(item, 'nativeDismissCancelled', {
    nativeEvent: { dismissCount: 1 },
  });
  expect(blocked).toHaveBeenCalledTimes(1);
  expect(screen.getByText('protected')).toBeVisible();
});
