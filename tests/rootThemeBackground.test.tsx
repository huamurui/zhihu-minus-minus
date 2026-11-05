import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import RootLayout from '../src/app/_layout';
import { resolveThemeColors } from '../src/constants/theme';
import { useSettingsStore } from '../src/store/useSettingsStore';
import { useThemeStore } from '../src/store/useThemeStore';

const mockNavigationMount = jest.fn();
const mockNavigationUnmount = jest.fn();
const mockScreenOptions = new Map<string, { headerShown?: boolean }>();

jest.mock('../src/global.css', () => ({}));
jest.mock('@sentry/react-native', () => ({
  wrap: (component: unknown) => component,
}));
jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('nativewind', () => ({ vars: () => ({}) }));
jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const Stack = ({ children }: { children: ReactNode }) => {
    React.useEffect(() => {
      mockNavigationMount();
      return mockNavigationUnmount;
    }, []);
    return <View testID="navigator">{children}</View>;
  };
  Stack.Screen = ({
    name,
    options,
  }: {
    name: string;
    options?: { headerShown?: boolean };
  }) => {
    mockScreenOptions.set(name, options ?? {});
    return null;
  };
  return {
    DarkTheme: { dark: true, colors: {} },
    DefaultTheme: { dark: false, colors: {} },
    ThemeProvider: ({
      children,
      value,
    }: {
      children: ReactNode;
      value: { colors: { background: string } };
    }) => {
      const { View } = jest.requireActual('react-native');
      return (
        <View
          testID="navigation-theme"
          style={{ backgroundColor: value.colors.background }}
        >
          {children}
        </View>
      );
    },
    Stack,
    useRouter: () => ({ push: jest.fn() }),
  };
});
jest.mock('../src/features/adaptive-layout/AdaptiveStack', () => ({
  AdaptiveStack: jest.requireMock('expo-router').Stack,
}));
jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: (props: ViewProps) => {
    const { View } = jest.requireActual('react-native');
    return <View {...props} testID="app-root" />;
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('react-native-root-siblings', () => ({
  RootSiblingParent: ({ children }: { children: ReactNode }) => children,
}));
jest.mock('expo-screen-orientation', () => ({
  OrientationLock: { DEFAULT: 0 },
  lockAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));
jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));
jest.mock('../src/components/ClipboardLinkModal', () => ({
  ClipboardLinkModal: () => null,
}));
jest.mock('../src/components/CollectionSelectorModal', () => ({
  CollectionSelectorModal: () => null,
}));
jest.mock('../src/components/CollectionToastOverlay', () => ({
  CollectionToastOverlay: () => null,
}));
jest.mock('../src/components/DoubleTapActionSheet', () => ({
  DoubleTapActionSheet: () => null,
}));
jest.mock('../src/components/GradientMaskOverlay', () => ({
  GradientMaskOverlay: () => null,
}));
jest.mock('../src/components/UpdateChecker', () => ({
  UpdateChecker: () => null,
}));
jest.mock('../src/components/VerificationModal', () => ({
  VerificationModal: () => null,
}));
jest.mock('../src/hooks/useQueryConnectivity', () => ({
  useQueryConnectivity: () => undefined,
}));
jest.mock('../src/utils/telemetry', () => ({
  initializeTelemetry: jest.fn(),
  setTelemetryEnabled: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/store/useTelemetryStore', () => ({
  useTelemetryStore: jest
    .requireActual('zustand')
    .create(() => ({ enabled: false, hasHydrated: false })),
}));
jest.mock('../src/store/useThemeStore', () => ({
  useThemeStore: jest
    .requireActual('zustand')
    .create(() => ({ isDark: false, hasHydrated: true })),
  useSyncThemeWithNativeWind: () => undefined,
}));
jest.mock('../src/store/useSettingsStore', () => ({
  useSettingsStore: jest.requireActual('zustand').create(() => ({
    primaryColor: '#0084ff',
    readingBackground: 'default',
    textContrast: 'standard',
    surfaceStyle: 'layered',
  })),
}));

beforeEach(() => {
  mockNavigationMount.mockClear();
  mockNavigationUnmount.mockClear();
  mockScreenOptions.clear();
  useThemeStore.setState({ isDark: false });
  useSettingsStore.setState({ readingBackground: 'default' });
});

test('the recent publications route hides the default header at registration', async () => {
  const host = await render(<RootLayout />);
  expect(mockScreenOptions.get('user/[id]/stream')?.headerShown).toBe(false);
  await host.unmount();
});

test('the surface behind fading screens follows appearance changes without remounting navigation', async () => {
  const host = await render(<RootLayout />);
  const readRootBackground = () =>
    StyleSheet.flatten(host.getByTestId('app-root').props.style)
      .backgroundColor;
  const expectOpaqueThemeBackground = (scheme: 'light' | 'dark') => {
    const expected = resolveThemeColors(
      scheme,
      useSettingsStore.getState(),
    ).background;
    const background = readRootBackground();
    expect(background).toBe(expected);
    expect(background).toBe(
      StyleSheet.flatten(host.getByTestId('navigation-theme').props.style)
        .backgroundColor,
    );
    expect(background).not.toBe('transparent');
    expect(mockNavigationMount).toHaveBeenCalledTimes(1);
    expect(mockNavigationUnmount).not.toHaveBeenCalled();
    return background;
  };

  const lightBackground = expectOpaqueThemeBackground('light');
  await act(() => useThemeStore.setState({ isDark: true }));
  const darkBackground = expectOpaqueThemeBackground('dark');
  expect(darkBackground).not.toBe(lightBackground);

  await act(() => useSettingsStore.setState({ readingBackground: 'warm' }));
  expect(expectOpaqueThemeBackground('dark')).not.toBe(darkBackground);

  await act(() => useThemeStore.setState({ isDark: false }));
  expectOpaqueThemeBackground('light');
});
