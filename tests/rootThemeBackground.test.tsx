import { act, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import RootLayout from '../app/_layout';
import { resolveThemeColors } from '../constants/theme';
import { useSettingsStore } from '../store/useSettingsStore';
import { useThemeStore } from '../store/useThemeStore';

const mockNavigationMount = jest.fn();
const mockNavigationUnmount = jest.fn();

jest.mock('../global.css', () => ({}));
jest.mock('@sentry/react-native', () => ({
  wrap: (component: unknown) => component,
}));
jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('nativewind', () => ({ vars: () => ({}) }));
jest.mock('@react-navigation/native', () => ({
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
}));
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
  Stack.Screen = () => null;
  return { Stack, useRouter: () => ({ push: jest.fn() }) };
});
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
jest.mock('../components/ClipboardLinkModal', () => ({
  ClipboardLinkModal: () => null,
}));
jest.mock('../components/CollectionSelectorModal', () => ({
  CollectionSelectorModal: () => null,
}));
jest.mock('../components/CollectionToastOverlay', () => ({
  CollectionToastOverlay: () => null,
}));
jest.mock('../components/DoubleTapActionSheet', () => ({
  DoubleTapActionSheet: () => null,
}));
jest.mock('../components/GradientMaskOverlay', () => ({
  GradientMaskOverlay: () => null,
}));
jest.mock('../components/UpdateChecker', () => ({ UpdateChecker: () => null }));
jest.mock('../components/VerificationModal', () => ({
  VerificationModal: () => null,
}));
jest.mock('../hooks/useQueryConnectivity', () => ({
  useQueryConnectivity: () => undefined,
}));
jest.mock('../utils/telemetry', () => ({
  initializeTelemetry: jest.fn(),
  setTelemetryEnabled: jest.fn(),
}));
jest.mock('../store/useTelemetryStore', () => ({
  useTelemetryStore: jest
    .requireActual('zustand')
    .create(() => ({ enabled: false, hasHydrated: false })),
}));
jest.mock('../store/useThemeStore', () => ({
  useThemeStore: jest
    .requireActual('zustand')
    .create(() => ({ isDark: false, hasHydrated: true })),
  useSyncThemeWithNativeWind: () => undefined,
}));
jest.mock('../store/useSettingsStore', () => ({
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
  useThemeStore.setState({ isDark: false });
  useSettingsStore.setState({ readingBackground: 'default' });
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
