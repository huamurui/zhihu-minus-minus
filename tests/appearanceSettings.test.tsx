import { act, fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import AppearanceSettings from '../src/app/settings/appearance';
import { colors } from '../src/constants/designTokens';
import { READING_BACKGROUND_OPTIONS } from '../src/constants/theme';
import {
  type AppSettings,
  useSettingsStore,
} from '../src/store/useSettingsStore';
import { useThemeStore } from '../src/store/useThemeStore';

let mockColorScheme: 'light' | 'dark' = 'light';
type GestureEvent = { x: number; y?: number };
type GestureCallback = (event: GestureEvent, success: boolean) => void;
type GesturePhase = 'begin' | 'start' | 'update' | 'end' | 'finalize';
interface MockGesture {
  kind: 'pan' | 'tap';
  index: number;
  handlers: Partial<Record<GesturePhase, GestureCallback>>;
  activeOffsetX: () => MockGesture;
  failOffsetY: () => MockGesture;
  maxDistance: () => MockGesture;
  onBegin: (callback: GestureCallback) => MockGesture;
  onStart: (callback: GestureCallback) => MockGesture;
  onUpdate: (callback: GestureCallback) => MockGesture;
  onEnd: (callback: GestureCallback) => MockGesture;
  onFinalize: (callback: GestureCallback) => MockGesture;
}
const mockPanGestures: MockGesture[] = [];
const mockTapGestures: MockGesture[] = [];

function mockCreateGesture(kind: 'pan' | 'tap'): MockGesture {
  const registry = kind === 'pan' ? mockPanGestures : mockTapGestures;
  const gesture: MockGesture = {
    kind,
    index: registry.length,
    handlers: {},
    activeOffsetX: () => gesture,
    failOffsetY: () => gesture,
    maxDistance: () => gesture,
    onBegin: (callback) => {
      gesture.handlers.begin = callback;
      return gesture;
    },
    onStart: (callback) => {
      gesture.handlers.start = callback;
      return gesture;
    },
    onUpdate: (callback) => {
      gesture.handlers.update = callback;
      return gesture;
    },
    onEnd: (callback) => {
      gesture.handlers.end = callback;
      return gesture;
    },
    onFinalize: (callback) => {
      gesture.handlers.finalize = callback;
      return gesture;
    },
  };
  registry.push(gesture);
  return gesture;
}

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureDetector: ({
    children,
    gesture,
  }: {
    children: ReactNode;
    gesture: MockGesture | { gestures: MockGesture[] };
  }) => {
    const pan =
      'gestures' in gesture
        ? gesture.gestures.find((item) => item.kind === 'pan')
        : gesture;
    const React = jest.requireActual('react');
    return React.cloneElement(React.Children.only(children), {
      testID: `color-slider-${pan?.index}`,
    });
  },
  Gesture: {
    Pan: () => mockCreateGesture('pan'),
    Tap: () => mockCreateGesture('tap'),
    Race: (...gestures: MockGesture[]) => ({ gestures }),
  },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { View: jest.requireActual('react-native').View },
  runOnJS: (callback: unknown) => callback,
  useSharedValue: (value: unknown) =>
    jest.requireActual('react').useRef({ value }).current,
  useAnimatedStyle: (factory: () => unknown) => factory(),
  withTiming: (value: unknown) => value,
}));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/settings/NavigationInteractionSettings', () => ({
  NavigationInteractionSettings: () => null,
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => mockColorScheme,
}));
jest.mock('../src/utils/haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('../src/store/useThemeStore', () => ({
  useThemeStore: jest.requireActual('zustand').create(() => ({
    themeMode: 'system',
    setThemeMode: jest.fn(),
  })),
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest
    .requireActual('zustand')
    .create((set: (settings: Partial<AppSettings>) => void) => ({
      primaryColor: '#0084ff',
      readingBackground: 'default',
      textContrast: 'standard',
      surfaceStyle: 'layered',
      fontSizeScale: 1,
      lineHeightScale: 1.5,
      richContentRenderer: 'native-v2',
      answerReadingMode: 'detail',
      unreadBadgeStyle: 'count',
      updateSettings: jest.fn(set),
    })),
}));

beforeEach(() => {
  mockColorScheme = 'light';
  mockPanGestures.length = 0;
  mockTapGestures.length = 0;
  jest.mocked(useSettingsStore.getState().updateSettings).mockClear();
  useSettingsStore.setState({
    primaryColor: colors.light.primary,
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  });
  useThemeStore.setState({ themeMode: 'system' });
});

test('reset restores the static default after selecting a different primary', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent.press(host.getByRole('radio', { name: '玫瑰红' }));
  expect(useSettingsStore.getState().primaryColor).toBe('#f43f5e');
  expect(host.getByRole('radio', { name: '玫瑰红' })).toBeChecked();

  await fireEvent.press(host.getByRole('button', { name: '恢复默认主题色' }));
  expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
  expect(host.getByRole('radio', { name: '知乎蓝' })).toBeChecked();
  expect(host.getByRole('radio', { name: '玫瑰红' })).not.toBeChecked();
});

test.each(['light', 'dark'] as const)(
  '%s reading background options select the existing stored key',
  async (scheme) => {
    mockColorScheme = scheme;
    const host = await render(<AppearanceSettings />);
    for (const option of READING_BACKGROUND_OPTIONS) {
      const swatch = host.getByRole('radio', { name: option.label });
      await fireEvent.press(swatch);
      expect(useSettingsStore.getState().readingBackground).toBe(option.value);
      expect(swatch).toBeChecked();
    }
  },
);

async function openColorPicker() {
  const host = await render(<AppearanceSettings />);
  await fireEvent(host.getByLabelText('显示自定义颜色'), 'valueChange', true);
  for (let index = 0; index < 3; index += 1) {
    await fireEvent(host.getByTestId(`color-slider-${index}`), 'layout', {
      nativeEvent: { layout: { width: 200, height: 32, x: 0, y: 0 } },
    });
  }
  return host;
}

function previewColor(host: Awaited<ReturnType<typeof openColorPicker>>) {
  return host.getByTestId('primary-color-preview').props.style.backgroundColor;
}

async function gestureEvent(
  gesture: MockGesture | undefined,
  phase: GesturePhase,
  x: number,
  success = true,
  y = 0,
) {
  if (!gesture) throw new Error(`Missing gesture for ${phase}`);
  await act(() => gesture.handlers[phase]?.({ x, y }, success));
}

async function dragSlider(index: number, x: number) {
  const pan = mockPanGestures[index];
  await gestureEvent(pan, 'begin', 100);
  await gestureEvent(pan, 'start', x);
  await gestureEvent(pan, 'update', x);
  await gestureEvent(pan, 'end', x);
  await gestureEvent(pan, 'finalize', x);
}

test.each([
  ['hue', 0],
  ['saturation', 1],
  ['lightness', 2],
] as const)(
  '%s previews while dragging and applies the theme once on release',
  async (_name, index) => {
    const host = await openColorPicker();
    const initialPreview = previewColor(host);
    const pan = mockPanGestures[index];
    await gestureEvent(pan, 'begin', 100);
    await gestureEvent(pan, 'start', 50);
    await gestureEvent(pan, 'update', 50);
    const nextPreview = previewColor(host);
    expect(nextPreview).not.toBe(initialPreview);
    expect(host.getByLabelText('自定义主题色').props.value).toBe(nextPreview);
    expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
    expect(useSettingsStore.getState().updateSettings).not.toHaveBeenCalled();

    await gestureEvent(pan, 'end', 50);
    await gestureEvent(pan, 'finalize', 50);
    expect(useSettingsStore.getState().primaryColor).toBe(nextPreview);
    expect(host.getByRole('radio', { name: '随主题' })).toHaveStyle({
      borderColor: nextPreview,
    });
    expect(useSettingsStore.getState().updateSettings).toHaveBeenCalledTimes(1);
  },
);

test.each([
  [160, false],
  [164, true],
] as const)(
  'a tap ending at %i applies its color even when the failed pan finalizes afterward: %s',
  async (endX, panFinishesLast) => {
    const host = await openColorPicker();
    const initialPreview = previewColor(host);
    const pan = mockPanGestures[0];
    const tap = mockTapGestures[0];
    await gestureEvent(pan, 'begin', 160);
    expect(previewColor(host)).toBe(initialPreview);
    await gestureEvent(tap, 'begin', 160);
    if (!panFinishesLast) await gestureEvent(pan, 'finalize', endX, false);
    await gestureEvent(tap, 'end', endX);
    await gestureEvent(tap, 'finalize', endX);
    if (panFinishesLast) await gestureEvent(pan, 'finalize', endX, false);

    const applied = useSettingsStore.getState().primaryColor;
    if (applied === null) throw new Error('The tap did not commit a color');
    expect(applied).not.toBe(colors.light.primary);
    expect(previewColor(host)).toBe(applied);
    expect(host.getByLabelText('自定义主题色').props.value).toBe(applied);
    expect(host.getByRole('radio', { name: '随主题' })).toHaveStyle({
      borderColor: applied,
    });
    expect(useSettingsStore.getState().updateSettings).toHaveBeenCalledTimes(1);
  },
);

test('canceling an active drag restores its preview without applying a color', async () => {
  const host = await openColorPicker();
  const initialPreview = previewColor(host);
  const initialHex = host.getByLabelText('自定义主题色').props.value;
  const pan = mockPanGestures[0];
  await gestureEvent(pan, 'begin', 100);
  await gestureEvent(pan, 'start', 50);
  await gestureEvent(pan, 'update', 50);
  expect(previewColor(host)).not.toBe(initialPreview);
  await gestureEvent(pan, 'end', 50, false);
  await gestureEvent(pan, 'finalize', 50, false);

  expect(previewColor(host)).toBe(initialPreview);
  expect(host.getByLabelText('自定义主题色').props.value).toBe(initialHex);
  expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
  expect(useSettingsStore.getState().updateSettings).not.toHaveBeenCalled();
});

test('a later canceled drag restores the color committed by the previous drag', async () => {
  const host = await openColorPicker();
  await dragSlider(0, 50);
  const committed = useSettingsStore.getState().primaryColor;
  jest.mocked(useSettingsStore.getState().updateSettings).mockClear();

  const pan = mockPanGestures[0];
  await gestureEvent(pan, 'begin', 50);
  await gestureEvent(pan, 'start', 150);
  await gestureEvent(pan, 'update', 150);
  expect(previewColor(host)).not.toBe(committed);
  await gestureEvent(pan, 'end', 150, false);
  await gestureEvent(pan, 'finalize', 150, false);

  expect(previewColor(host)).toBe(committed);
  expect(host.getByLabelText('自定义主题色').props.value).toBe(committed);
  expect(useSettingsStore.getState().primaryColor).toBe(committed);
  expect(useSettingsStore.getState().updateSettings).not.toHaveBeenCalled();
});

test('vertical scrolling that starts on a slider leaves the color unchanged', async () => {
  const host = await openColorPicker();
  const initialPreview = previewColor(host);
  const pan = mockPanGestures[0];
  const tap = mockTapGestures[0];
  await gestureEvent(pan, 'begin', 20);
  expect(previewColor(host)).toBe(initialPreview);
  await gestureEvent(tap, 'begin', 20);
  await gestureEvent(pan, 'finalize', 22, false, 40);
  await gestureEvent(tap, 'finalize', 22, false, 40);

  expect(previewColor(host)).toBe(initialPreview);
  expect(useSettingsStore.getState().primaryColor).toBe(colors.light.primary);
  expect(useSettingsStore.getState().updateSettings).not.toHaveBeenCalled();
});

test('consecutive slider edits preserve other channels and the committed color survives reopening', async () => {
  const host = await openColorPicker();
  await fireEvent.changeText(host.getByLabelText('自定义主题色'), '#ff0000');
  await dragSlider(0, (120 / 359) * 200);
  expect(useSettingsStore.getState().primaryColor).toBe('#00ff00');
  await dragSlider(1, 100);
  expect(useSettingsStore.getState().primaryColor).toBe('#39c639');
  await dragSlider(2, 50);
  expect(useSettingsStore.getState().primaryColor).toBe('#227722');

  await fireEvent(host.getByLabelText('显示自定义颜色'), 'valueChange', false);
  await fireEvent(host.getByLabelText('显示自定义颜色'), 'valueChange', true);
  expect(host.getByLabelText('自定义主题色').props.value).toBe('#227722');
  expect(useSettingsStore.getState().primaryColor).toBe('#227722');
  expect(host.getByRole('radio', { name: '随主题' })).toHaveStyle({
    borderColor: '#227722',
  });
});

test('accessible adjustments apply colors and respect the slider bounds', async () => {
  const host = await openColorPicker();
  await fireEvent.changeText(host.getByLabelText('自定义主题色'), '#ff0000');
  const hue = host.getByRole('adjustable', { name: '色相' });
  expect(host.getByRole('adjustable', { name: '饱和度' })).toBeTruthy();
  expect(host.getByRole('adjustable', { name: '亮度' })).toBeTruthy();

  await fireEvent(hue, 'accessibilityAction', {
    nativeEvent: { actionName: 'decrement' },
  });
  expect(useSettingsStore.getState().primaryColor).toBe('#ff0000');
  await fireEvent(hue, 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(hue.props.accessibilityValue.now).toBe(1);
  expect(useSettingsStore.getState().primaryColor).toBe('#ff0400');
  expect(previewColor(host)).toBe('#ff0400');

  await dragSlider(0, 200);
  const upperBoundColor = useSettingsStore.getState().primaryColor;
  await fireEvent(hue, 'accessibilityAction', {
    nativeEvent: { actionName: 'increment' },
  });
  expect(hue.props.accessibilityValue.now).toBe(359);
  expect(useSettingsStore.getState().primaryColor).toBe(upperBoundColor);
});

test('selects the answer destination mode without changing the body renderer', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent.press(host.getByText('预览卡片列表'));
  expect(useSettingsStore.getState().answerReadingMode).toBe('preview-list');
  expect(useSettingsStore.getState().richContentRenderer).toBe('native-v2');
  await fireEvent.press(host.getByText('回答详情'));
  expect(useSettingsStore.getState().answerReadingMode).toBe('detail');
});

test('selects a quieter unread badge style', async () => {
  const host = await render(<AppearanceSettings />);
  await fireEvent.press(host.getByText('小圆点'));
  expect(useSettingsStore.getState().unreadBadgeStyle).toBe('dot');
  await fireEvent.press(host.getByText('不显示'));
  expect(useSettingsStore.getState().unreadBadgeStyle).toBe('hidden');
});
