import { fireEvent, render } from '@testing-library/react-native';
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

beforeEach(() => {
  useSettingsStore.getState().resetSettings();
});

afterEach(() => jest.restoreAllMocks());

test('Android 14 offers predictive back and applies the switch immediately', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  jest.spyOn(Platform, 'Version', 'get').mockReturnValue(34);
  const host = await render(<NavigationInteractionSettings />);
  const control = host.getByLabelText('预测性返回');
  expect(control).toHaveProp('on', true);
  await fireEvent(control, 'change', { nativeEvent: { value: false } });
  expect(useSettingsStore.getState().androidPredictiveBackEnabled).toBe(false);
  expect(control).toHaveProp('on', false);
  await fireEvent(control, 'change', { nativeEvent: { value: true } });
  expect(useSettingsStore.getState().androidPredictiveBackEnabled).toBe(true);
});

test.each(['android', 'ios', 'web'] as const)(
  'hides the predictive back switch on unsupported platforms (%s)',
  async (platform) => {
    jest.replaceProperty(Platform, 'OS', platform);
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    const host = await render(<NavigationInteractionSettings />);
    expect(host.queryByLabelText('预测性返回')).toBeNull();
  },
);

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
