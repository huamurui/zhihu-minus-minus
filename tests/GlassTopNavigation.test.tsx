import { fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import {
  GlassTopNavigation,
  isLiquidGlassSupported,
} from '../src/components/home/GlassTopNavigation';

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
    interpolateColor: () => '#0066FF',
    interpolate: (_val: number, _in: number[], out: number[]) => out[0],
    Extrapolate: { CLAMP: 'clamp' },
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => {
  const native = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: (props: Record<string, unknown>) => (
      <native.View {...props} testID="search-icon" />
    ),
  };
});

jest.mock('expo-blur', () => {
  const native = jest.requireActual('react-native');
  return {
    BlurView: (props: Record<string, unknown>) => (
      <native.View {...props} testID={props.testID || 'blur-surface'} />
    ),
  };
});

jest.mock('expo-glass-effect', () => {
  const native = jest.requireActual('react-native');
  return {
    GlassContainer: (props: Record<string, unknown>) => (
      <native.View {...props} testID={props.testID || 'glass-container'} />
    ),
    GlassView: (props: {
      glassEffectStyle?: string;
      [key: string]: unknown;
    }) => (
      <native.View
        {...props}
        testID={
          props.testID || `glass-surface-${props.glassEffectStyle || 'unknown'}`
        }
      />
    ),
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  };
});

describe('GlassTopNavigation', () => {
  const originalPlatform = Platform.OS;
  const originalVersion = Platform.Version;

  const setPlatformVersion = (version: string) => {
    Object.defineProperty(Platform, 'Version', {
      value: version,
      configurable: true,
      writable: true,
    });
  };

  afterEach(() => {
    Platform.OS = originalPlatform;
    setPlatformVersion(String(originalVersion));
  });

  describe('isLiquidGlassSupported', () => {
    test('returns false on non-ios platforms', () => {
      Platform.OS = 'android';
      expect(isLiquidGlassSupported()).toBe(false);
    });

    test('returns false when glass effect API is unavailable', () => {
      Platform.OS = 'ios';
      const mockApi =
        jest.requireMock('expo-glass-effect').isGlassEffectAPIAvailable;
      mockApi.mockReturnValueOnce(false);
      expect(isLiquidGlassSupported()).toBe(false);
    });

    test('returns true on iOS when API is available', () => {
      Platform.OS = 'ios';
      expect(isLiquidGlassSupported()).toBe(true);
    });
  });

  describe('render and interactions', () => {
    const mockScrollX = { value: 0 } as unknown as SharedValue<number>;
    const mockInsets = { top: 44, bottom: 34, left: 0, right: 0 };
    const tabs = ['following', 'recommend', 'hot', 'daily'];

    test('renders tabs and search button with correct roles and labels', async () => {
      const onTabPress = jest.fn();
      const onSearchPress = jest.fn();

      const host = await render(
        <GlassTopNavigation
          tabs={tabs}
          currentPage={1}
          scrollX={mockScrollX}
          topInset={16}
          insets={mockInsets}
          colorScheme="light"
          indicatorBgColor="rgba(0, 100, 255, 0.2)"
          tintColor="#0066FF"
          secondaryTextColor="#888888"
          textColor="#111111"
          onTabPress={onTabPress}
          onSearchPress={onSearchPress}
        />,
      );

      expect(host.getByRole('tab', { name: '关注' })).toBeTruthy();
      expect(host.getByRole('tab', { name: '推荐' })).toBeTruthy();
      expect(host.getByRole('tab', { name: '热榜' })).toBeTruthy();
      expect(host.getByRole('tab', { name: '日报' })).toBeTruthy();
      expect(host.getByRole('button', { name: '搜索' })).toBeTruthy();
    });

    test('triggers onTabPress callback when a tab is tapped', async () => {
      const onTabPress = jest.fn();
      const onSearchPress = jest.fn();

      const host = await render(
        <GlassTopNavigation
          tabs={tabs}
          currentPage={0}
          scrollX={mockScrollX}
          topInset={16}
          insets={mockInsets}
          colorScheme="dark"
          indicatorBgColor="rgba(0, 100, 255, 0.2)"
          tintColor="#0066FF"
          secondaryTextColor="#888888"
          textColor="#FFFFFF"
          onTabPress={onTabPress}
          onSearchPress={onSearchPress}
        />,
      );

      await fireEvent.press(host.getByRole('tab', { name: '热榜' }));
      expect(onTabPress).toHaveBeenCalledWith(2);
    });

    test('triggers onSearchPress callback when search button is pressed', async () => {
      const onTabPress = jest.fn();
      const onSearchPress = jest.fn();

      const host = await render(
        <GlassTopNavigation
          tabs={tabs}
          currentPage={0}
          scrollX={mockScrollX}
          topInset={16}
          insets={mockInsets}
          colorScheme="light"
          indicatorBgColor="rgba(0, 100, 255, 0.2)"
          tintColor="#0066FF"
          secondaryTextColor="#888888"
          textColor="#111111"
          onTabPress={onTabPress}
          onSearchPress={onSearchPress}
        />,
      );

      await fireEvent.press(host.getByRole('button', { name: '搜索' }));
      expect(onSearchPress).toHaveBeenCalledTimes(1);
    });

    test('renders with regular outer track, search button, and GlassContainer on supported devices', async () => {
      Platform.OS = 'ios';
      setPlatformVersion('26.0');

      const host = await render(
        <GlassTopNavigation
          tabs={tabs}
          currentPage={0}
          scrollX={mockScrollX}
          topInset={16}
          insets={mockInsets}
          colorScheme="dark"
          indicatorBgColor="rgba(0, 100, 255, 0.2)"
          tintColor="#0066FF"
          secondaryTextColor="#888888"
          textColor="#FFFFFF"
          onTabPress={jest.fn()}
          onSearchPress={jest.fn()}
        />,
      );

      expect(host.getByRole('tab', { name: '关注' })).toBeTruthy();
      expect(host.getByRole('button', { name: '搜索' })).toBeTruthy();

      // GlassContainer wraps with spacing 8 for metaball fusion
      const container = host.getByTestId('glass-container');
      expect(container).toBeTruthy();
      expect(container.props.spacing).toBe(8);

      // Both outer track and search button use regular Liquid Glass
      const regularSurfaces = host.getAllByTestId('glass-surface-regular');
      expect(regularSurfaces.length).toBe(2);

      // Search button must have isInteractive
      const searchSurface = regularSurfaces[1];
      expect(searchSurface.props.isInteractive).toBe(true);

      // No BlurView rendered in liquid glass mode
      expect(host.queryByTestId('blur-surface')).toBeNull();
    });

    test('renders separated tab track and search button in normal BlurView mode', async () => {
      const onTabPress = jest.fn();
      const onSearchPress = jest.fn();

      const host = await render(
        <GlassTopNavigation
          tabs={tabs}
          currentPage={0}
          scrollX={mockScrollX}
          topInset={16}
          insets={mockInsets}
          colorScheme="light"
          indicatorBgColor="rgba(0, 100, 255, 0.2)"
          tintColor="#0066FF"
          secondaryTextColor="#888888"
          textColor="#111111"
          useLiquidGlass={false}
          onTabPress={onTabPress}
          onSearchPress={onSearchPress}
        />,
      );

      expect(host.getByRole('tab', { name: '关注' })).toBeTruthy();
      expect(host.getByRole('button', { name: '搜索' })).toBeTruthy();

      // BlurViews rendered, no GlassViews
      const blurViews = host.getAllByTestId('blur-surface');
      expect(blurViews.length).toBe(2);
      expect(host.queryByTestId('glass-surface-clear')).toBeNull();
      expect(host.queryByTestId('glass-surface-regular')).toBeNull();

      await fireEvent.press(host.getByRole('button', { name: '搜索' }));
      expect(onSearchPress).toHaveBeenCalledTimes(1);
    });
  });
});
