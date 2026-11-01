import { fireEvent, render } from '@testing-library/react-native';
import { NavigationInteractionSettings } from '../src/components/settings/NavigationInteractionSettings';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  useThemeColor: () => '#123456',
  useRuntimeThemeColors: () => ({
    primary: '#123456',
    textTertiary: '#999999',
  }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
});

test('the single pane switch applies both changes immediately', async () => {
  const host = await render(<NavigationInteractionSettings />);
  expect(host.getByText('双栏布局（试验性）')).toBeVisible();
  expect(host.getByLabelText('启用双栏布局')).toHaveProp('value', false);

  await fireEvent(host.getByLabelText('启用双栏布局'), 'valueChange', true);
  expect(useSettingsStore.getState().enableLargeScreenLayout).toBe(true);
  expect(host.getByLabelText('启用双栏布局')).toHaveProp('value', true);

  await fireEvent(host.getByLabelText('启用双栏布局'), 'valueChange', false);
  expect(useSettingsStore.getState().enableLargeScreenLayout).toBe(false);
  expect(host.getByLabelText('启用双栏布局')).toHaveProp('value', false);
});

test('iOS liquid glass switch toggles useNativeIOSBottomTabs under dedicated material section', async () => {
  const host = await render(<NavigationInteractionSettings />);

  expect(host.getByText('界面材质')).toBeVisible();
  const glassSwitch = host.getByLabelText('iOS 26+ 液态玻璃');

  expect(glassSwitch).toHaveProp('value', true);

  // Toggle liquid glass off
  await fireEvent(glassSwitch, 'valueChange', false);
  expect(useSettingsStore.getState().useNativeIOSBottomTabs).toBe(false);
  expect(glassSwitch).toHaveProp('value', false);

  // Toggle liquid glass back on
  await fireEvent(glassSwitch, 'valueChange', true);
  expect(useSettingsStore.getState().useNativeIOSBottomTabs).toBe(true);
  expect(glassSwitch).toHaveProp('value', true);
});
