import { act, render } from '@testing-library/react-native';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import {
  FloatingSurface,
  isLiquidGlassSupported,
  resetReduceTransparencyForTesting,
} from '../src/components/surfaces/FloatingSurface';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('expo-blur', () => {
  const native = jest.requireActual('react-native');
  return {
    BlurView: (props: Record<string, unknown>) => (
      <native.View
        {...props}
        testID={props.testID ? `${props.testID}-blur` : 'blur-view'}
      />
    ),
  };
});

jest.mock('expo-glass-effect', () => {
  const native = jest.requireActual('react-native');
  return {
    GlassView: (props: Record<string, unknown>) => (
      <native.View
        {...props}
        testID={props.testID ? `${props.testID}-glass` : 'glass-view'}
      />
    ),
    isGlassEffectAPIAvailable: jest.fn(() => true),
    isLiquidGlassAvailable: jest.fn(() => true),
  };
});

describe('FloatingSurface', () => {
  const originalPlatform = Platform.OS;
  let reduceTransparencyHandler: ((enabled: boolean) => void) | null = null;
  const mockRemove = jest.fn();

  beforeEach(() => {
    Platform.OS = 'ios';
    jest.clearAllMocks();
    resetReduceTransparencyForTesting();
    reduceTransparencyHandler = null;

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

    jest
      .spyOn(AccessibilityInfo, 'addEventListener')
      .mockImplementation((event, handler) => {
        if (event === 'reduceTransparencyChanged') {
          reduceTransparencyHandler = handler as (enabled: boolean) => void;
        }
        return { remove: mockRemove };
      });
  });

  afterEach(() => {
    Platform.OS = originalPlatform;
    jest.restoreAllMocks();
  });

  describe('isLiquidGlassSupported', () => {
    test('returns false on Android', () => {
      Platform.OS = 'android';
      expect(isLiquidGlassSupported()).toBe(false);
    });

    test('returns false on iOS if isGlassEffectAPIAvailable is false', () => {
      const mockApi =
        jest.requireMock('expo-glass-effect').isGlassEffectAPIAvailable;
      mockApi.mockReturnValueOnce(false);
      expect(isLiquidGlassSupported()).toBe(false);
    });

    test('returns false on iOS if isLiquidGlassAvailable is false', () => {
      const mockLiquid =
        jest.requireMock('expo-glass-effect').isLiquidGlassAvailable;
      mockLiquid.mockReturnValueOnce(false);
      expect(isLiquidGlassSupported()).toBe(false);
    });

    test('returns true on iOS when both APIs return true', () => {
      expect(isLiquidGlassSupported()).toBe(true);
    });
  });

  describe('useIsLiquidGlassActive & FloatingSurface rendering', () => {
    test('renders GlassView on iOS when supported and transparency is normal with correct glassEffectStyle', async () => {
      const host = await render(
        <FloatingSurface testID="surface" glassStyle="clear">
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      const glass = host.getByTestId('surface-glass');
      expect(glass).toBeTruthy();
      expect(glass.props.glassEffectStyle).toBe('clear');
      expect(host.queryByTestId('surface-blur')).toBeNull();
    });

    test('renders BlurView when platform is Android', async () => {
      Platform.OS = 'android';
      const host = await render(
        <FloatingSurface testID="surface">
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      expect(host.getByTestId('surface-blur')).toBeTruthy();
      expect(host.queryByTestId('surface-glass')).toBeNull();
    });

    test('renders BlurView when forceBlur is true', async () => {
      const host = await render(
        <FloatingSurface testID="surface" forceBlur={true}>
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      expect(host.getByTestId('surface-blur')).toBeTruthy();
      expect(host.queryByTestId('surface-glass')).toBeNull();
    });

    test('falls back to BlurView when user disabled Liquid Glass in settings', async () => {
      useSettingsStore.setState({ useNativeIOSBottomTabs: false });

      const host = await render(
        <FloatingSurface testID="surface">
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      expect(host.getByTestId('surface-blur')).toBeTruthy();
      expect(host.queryByTestId('surface-glass')).toBeNull();

      await act(async () => {
        useSettingsStore.setState({ useNativeIOSBottomTabs: true });
      });
    });

    test('falls back to BlurView when Reduce Transparency is initially enabled', async () => {
      jest
        .spyOn(AccessibilityInfo, 'isReduceTransparencyEnabled')
        .mockResolvedValue(true);

      const host = await render(
        <FloatingSurface testID="surface">
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      expect(host.getByTestId('surface-blur')).toBeTruthy();
      expect(host.queryByTestId('surface-glass')).toBeNull();
    });

    test('responds to reduceTransparencyChanged events dynamically', async () => {
      const host = await render(
        <FloatingSurface testID="surface">
          <Text>Content</Text>
        </FloatingSurface>,
      );
      await act(async () => {});

      expect(reduceTransparencyHandler).not.toBeNull();
      expect(host.getByTestId('surface-glass')).toBeTruthy();
      expect(host.queryByTestId('surface-blur')).toBeNull();

      // Trigger change to reduceTransparency = true
      await act(async () => {
        reduceTransparencyHandler?.(true);
      });

      expect(host.getByTestId('surface-blur')).toBeTruthy();
      expect(host.queryByTestId('surface-glass')).toBeNull();

      // Trigger change back to reduceTransparency = false
      await act(async () => {
        reduceTransparencyHandler?.(false);
      });

      expect(host.getByTestId('surface-glass')).toBeTruthy();
      expect(host.queryByTestId('surface-blur')).toBeNull();
    });
  });
});
