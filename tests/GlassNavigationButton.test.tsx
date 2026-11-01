import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, StyleSheet, Text } from 'react-native';
import { GlassNavigationButton } from '../src/components/navigation/GlassNavigationButton';

jest.mock('react-native-reanimated', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: {
      View: native.View,
      Text: native.Text,
      createAnimatedComponent: (c: unknown) => c,
    },
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: unknown) => ({ value }),
    cancelAnimation: jest.fn(),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

jest.mock('expo-blur', () => {
  const native = jest.requireActual('react-native');
  return {
    BlurView: (props: Record<string, unknown>) => (
      <native.View {...props} testID={props.testID || 'blur-view'} />
    ),
  };
});

jest.mock('expo-glass-effect', () => {
  const native = jest.requireActual('react-native');
  return {
    GlassView: (props: Record<string, unknown>) => (
      <native.View {...props} testID={props.testID || 'glass-view'} />
    ),
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => (
      <native.View {...props} testID={`icon-${props.name}`} />
    ),
  };
});

describe('GlassNavigationButton', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    Platform.OS = 'ios';
    jest.clearAllMocks();

    if (!AccessibilityInfo.addEventListener) {
      (
        AccessibilityInfo as unknown as { addEventListener: jest.Mock }
      ).addEventListener = jest.fn();
    }
    if (!AccessibilityInfo.isReduceTransparencyEnabled) {
      (
        AccessibilityInfo as unknown as {
          isReduceTransparencyEnabled: jest.Mock;
        }
      ).isReduceTransparencyEnabled = jest.fn();
    }

    jest
      .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
      .mockResolvedValue(false);

    jest.spyOn(AccessibilityInfo, 'addEventListener').mockReturnValue({
      remove: jest.fn(),
    });
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  test('renders native glass button on iOS 26+ when supported', async () => {
    const onPress = jest.fn();
    const host = await render(
      <GlassNavigationButton
        testID="nav-btn"
        icon="back"
        accessibilityLabel="返回"
        onPress={onPress}
      />,
    );

    const button = host.getByTestId('nav-btn');
    expect(button).toBeTruthy();
    expect(host.getByTestId('icon-chevron-back')).toBeTruthy();

    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('renders close icon when icon="close"', async () => {
    const host = await render(
      <GlassNavigationButton
        testID="nav-close"
        icon="close"
        accessibilityLabel="关闭"
        onPress={jest.fn()}
      />,
    );

    expect(host.getByTestId('icon-close')).toBeTruthy();
  });

  test('renders custom children when provided', async () => {
    const host = await render(
      <GlassNavigationButton
        testID="nav-custom"
        accessibilityLabel="自定义"
        onPress={jest.fn()}
      >
        <Text testID="custom-text">Custom</Text>
      </GlassNavigationButton>,
    );

    expect(host.getByTestId('custom-text')).toBeTruthy();
  });

  test('falls back to standard BouncyButton on Android', async () => {
    Platform.OS = 'android';
    const onPress = jest.fn();

    const host = await render(
      <GlassNavigationButton
        testID="nav-android"
        icon="back"
        accessibilityLabel="返回"
        onPress={onPress}
      />,
    );

    const button = host.getByTestId('nav-android');
    expect(button).toBeTruthy();
    expect(host.getByTestId('icon-arrow-back')).toBeTruthy();

    await fireEvent.press(button);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  test('fallback retains transparent background by default and applies custom background when specified', async () => {
    // Disable liquid glass so fallback BouncyButton is used on iOS
    const { useSettingsStore } = require('../src/store/useSettingsStore');
    await act(async () => {
      useSettingsStore.setState({ useNativeIOSBottomTabs: false });
    });

    const hostTransparent = await render(
      <GlassNavigationButton
        testID="nav-transparent"
        icon="back"
        accessibilityLabel="返回"
        onPress={jest.fn()}
      />,
    );
    const transparentBtn = hostTransparent.getByTestId('nav-transparent');
    expect(StyleSheet.flatten(transparentBtn.props.style).backgroundColor).toBe(
      'transparent',
    );

    const hostCustomBg = await render(
      <GlassNavigationButton
        testID="nav-custom-bg"
        icon="back"
        accessibilityLabel="返回"
        backgroundColor="#123456"
        onPress={jest.fn()}
      />,
    );
    const customBgBtn = hostCustomBg.getByTestId('nav-custom-bg');
    expect(StyleSheet.flatten(customBgBtn.props.style).backgroundColor).toBe(
      '#123456',
    );

    await act(async () => {
      useSettingsStore.setState({ useNativeIOSBottomTabs: true });
    });
  });
});
