import { act, fireEvent, render } from '@testing-library/react-native';
import { Platform } from 'react-native';
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

const originalPlatform = Platform.OS;
beforeEach(() => {
  useSettingsStore.getState().resetSettings();
});
afterEach(() => {
  Platform.OS = originalPlatform;
});

test('layout mode starts automatic and applies each manual choice', async () => {
  const host = await render(<NavigationInteractionSettings />);
  expect(host.getByRole('radio', { name: '自动' })).toBeChecked();
  for (const [label, mode] of [
    ['单栏', 'single'],
    ['双栏', 'dual'],
    ['自动', 'auto'],
  ] as const) {
    const option = host.getByRole('radio', { name: label });
    await fireEvent.press(option);
    expect(option).toBeChecked();
    expect(useSettingsStore.getState().largeScreenLayoutMode).toBe(mode);
  }
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

test('Android opacity feedback exposes only the relevant press setting', async () => {
  Platform.OS = 'android';
  const host = await render(<NavigationInteractionSettings />);
  const opacity = host.getByRole('radio', { name: '仅透明度' });
  await fireEvent.press(opacity);
  expect(opacity).toBeChecked();
  expect(useSettingsStore.getState().androidFeedbackType).toBe('opacity');
  expect(host.getByText('按压不透明度')).toBeVisible();
  expect(host.queryByText('按压缩放比例')).toBeNull();
  await fireEvent.press(host.getByRole('radio', { name: '缩放' }));
  expect(host.getByText('按压缩放比例')).toBeVisible();
  await fireEvent.press(host.getByRole('radio', { name: '水波纹' }));
  expect(host.queryByText('按压不透明度')).toBeNull();
});

test('editing press feedback in performance mode exposes the active controls and preserves the saved style', async () => {
  Platform.OS = 'android';
  useSettingsStore.getState().updateSettings({
    performanceMode: true,
    androidFeedbackType: 'scale-opacity',
  });
  const host = await render(<NavigationInteractionSettings />);
  expect(host.queryByRole('radio', { name: '缩放' })).toBeNull();
  expect(host.queryByText('按压缩放比例')).toBeNull();
  expect(host.getByText('按压不透明度')).toBeVisible();
  await fireEvent(host.getByLabelText('视觉反馈'), 'valueChange', false);
  expect(host.queryByText('按压不透明度')).toBeNull();
  await act(() =>
    useSettingsStore
      .getState()
      .updateSettings({ performanceMode: false, enablePressFeedback: true }),
  );
  expect(host.getByRole('radio', { name: '缩放' })).toBeChecked();
  expect(host.getByText('按压缩放比例')).toBeVisible();
});
