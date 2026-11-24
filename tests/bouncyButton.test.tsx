import { act, render, userEvent } from '@testing-library/react-native';
import { type ComponentRef, createRef } from 'react';
import { Platform, type Pressable, Text } from 'react-native';
import { registerCSS } from 'react-native-css-interop/test';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BouncyButton } from '../src/components/BouncyButton';
import { useThemeColor } from '../src/components/Themed';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { impactAsync } from '../src/utils/haptics';

jest.mock('react-native/Libraries/Components/View/ViewNativeComponent', () => ({
  ...jest.requireActual(
    'react-native/Libraries/Components/View/ViewNativeComponent',
  ),
  __esModule: true,
  Commands: { hotspotUpdate: jest.fn(), setPressed: jest.fn() },
}));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  default: { createAnimatedComponent: (component: unknown) => component },
  useSharedValue: jest.fn((value: number) => ({ value })),
  useAnimatedStyle: jest.fn((read: () => object) => read()),
  withSpring: jest.fn((value: number) => value),
  withTiming: jest.fn((value: number) => value),
}));
jest.mock('../src/components/Themed', () => ({
  useThemeColor: jest.fn(() => '#4488cc'),
}));
jest.mock('../src/utils/haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(),
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}));

const originalPlatform = Platform.OS;
beforeEach(() => {
  Platform.OS = 'android';
  useSettingsStore.getState().resetSettings();
  jest.clearAllMocks();
});
afterEach(() => {
  Platform.OS = originalPlatform;
});

test('switches feedback on a mounted button and allocates animations only while scaling', async () => {
  const ref = createRef<ComponentRef<typeof Pressable>>();
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();
  const onPress = jest.fn();
  const host = await render(
    <BouncyButton
      ref={ref}
      accessibilityRole="button"
      android_ripple={{ radius: 12 }}
      hapticFeedback
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
    >
      <Text>打开正文</Text>
    </BouncyButton>,
  );
  const press = () => {
    expect(ref.current).toBeTruthy();
    return userEvent.press(host.getByRole('button'));
  };
  expect(host.getByRole('button')).toHaveProp(
    'nativeForegroundAndroid',
    expect.objectContaining({ rippleRadius: 12 }),
  );
  await press();
  expect(useThemeColor).toHaveBeenCalled();
  expect(useSharedValue).not.toHaveBeenCalled();
  expect(useAnimatedStyle).not.toHaveBeenCalled();
  jest.mocked(useThemeColor).mockClear();

  await act(() => useSettingsStore.setState({ enablePressFeedback: false }));
  await press();
  expect(useThemeColor).not.toHaveBeenCalled();
  expect(useSharedValue).not.toHaveBeenCalled();
  expect(useAnimatedStyle).not.toHaveBeenCalled();

  await act(() =>
    useSettingsStore.setState({
      enablePressFeedback: true,
      androidFeedbackType: 'scale-opacity',
      pressScale: 0.9,
      pressOpacity: 0.6,
    }),
  );
  await press();
  expect(useSharedValue).toHaveBeenCalled();
  expect(useAnimatedStyle).toHaveBeenCalled();
  expect(withSpring).toHaveBeenCalledWith(0.9, expect.anything());
  expect(withTiming).toHaveBeenCalledWith(0.6, expect.anything());
  expect(withSpring).toHaveBeenLastCalledWith(1, expect.anything());
  expect(withTiming).toHaveBeenLastCalledWith(1, expect.anything());
  expect(useThemeColor).not.toHaveBeenCalled();
  jest.mocked(useSharedValue).mockClear();
  jest.mocked(useAnimatedStyle).mockClear();

  await act(() => useSettingsStore.setState({ androidFeedbackType: 'ripple' }));
  await press();
  expect(useSharedValue).not.toHaveBeenCalled();
  expect(useAnimatedStyle).not.toHaveBeenCalled();
  expect(useThemeColor).toHaveBeenCalled();
  for (const callback of [onPressIn, onPressOut, onPress, impactAsync]) {
    expect(callback).toHaveBeenCalledTimes(4);
  }
  await host.unmount();
  expect(ref.current).toBeNull();
});

test('iOS uses scaling independently of the Android preference', async () => {
  Platform.OS = 'ios';
  const host = await render(
    <BouncyButton accessibilityRole="button">
      <Text>打开正文</Text>
    </BouncyButton>,
  );
  await userEvent.press(host.getByRole('button'));
  expect(withSpring).toHaveBeenCalled();
  expect(useThemeColor).not.toHaveBeenCalled();
  expect(impactAsync).not.toHaveBeenCalled();
});

test.each(['android', 'ios'] as const)(
  '%s can override the saved animated style and restore it when performance mode is turned off',
  async (platform) => {
    Platform.OS = platform;
    useSettingsStore.getState().updateSettings({
      androidFeedbackType: 'scale-opacity',
      performanceMode: true,
      pressOpacity: 0.5,
    });
    const host = await render(
      <BouncyButton accessibilityRole="button" testOnly_pressed>
        <Text>打开正文</Text>
      </BouncyButton>,
    );
    const target = () => host.getByRole('button');
    expect(target()).toHaveStyle({ opacity: 0.5 });
    expect(useSharedValue).not.toHaveBeenCalled();
    await act(() =>
      useSettingsStore
        .getState()
        .updateSettings({ enablePressFeedback: false }),
    );
    expect(target()).not.toHaveStyle({ opacity: 0.5 });
    expect(useSharedValue).not.toHaveBeenCalled();
    await act(() =>
      useSettingsStore
        .getState()
        .updateSettings({ enablePressFeedback: true, performanceMode: false }),
    );
    expect(useSharedValue).toHaveBeenCalled();
    expect(useSettingsStore.getState().androidFeedbackType).toBe(
      'scale-opacity',
    );
  },
);

test('opacity feedback composes with styles resolved from NativeWind classes', async () => {
  registerCSS('.feedback-opacity-test { opacity: 0.5; padding-left: 10px; }');
  useSettingsStore.setState({
    androidFeedbackType: 'opacity',
    pressOpacity: 0.5,
  });
  const host = await render(
    <BouncyButton
      className="feedback-opacity-test"
      accessibilityRole="button"
      testOnly_pressed
    >
      <Text>打开正文</Text>
    </BouncyButton>,
  );
  expect(host.getByRole('button')).toHaveStyle({
    opacity: 0.25,
    paddingLeft: 10,
  });
});

test('opacity feedback respects existing opacity and keeps one accessible press target', async () => {
  useSettingsStore.setState({
    androidFeedbackType: 'opacity',
    pressOpacity: 0.5,
  });
  const ref = createRef<ComponentRef<typeof Pressable>>();
  const onPress = jest.fn();
  const onPressIn = jest.fn();
  const onPressOut = jest.fn();
  const button = (pressed: boolean, disabled = false) => (
    <BouncyButton
      ref={ref}
      accessibilityRole="button"
      hitSlop={12}
      hapticFeedback
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      testOnly_pressed={pressed}
      style={[{ opacity: 0.9 }, { opacity: 0.5 }]}
    >
      <Text>打开正文</Text>
    </BouncyButton>
  );
  const host = await render(button(false));
  const target = () => host.getByRole('button', { name: '打开正文' });
  expect(ref.current).toBeTruthy();
  expect(target()).toHaveProp('hitSlop', 12);
  expect(target()).toHaveStyle({ opacity: 0.5 });
  expect(target()).not.toHaveProp('nativeForegroundAndroid');
  await host.rerender(button(true));
  expect(target()).toHaveStyle({ opacity: 0.25 });
  await host.rerender(button(false));
  expect(target()).toHaveStyle({ opacity: 0.5 });
  await userEvent.press(target());
  await host.rerender(button(false, true));
  expect(target()).toBeDisabled();
  await userEvent.press(target());
  for (const callback of [onPress, onPressIn, onPressOut, impactAsync]) {
    expect(callback).toHaveBeenCalledTimes(1);
  }
  expect(useSharedValue).not.toHaveBeenCalled();
  expect(useAnimatedStyle).not.toHaveBeenCalled();
  await host.unmount();
  expect(ref.current).toBeNull();
});
