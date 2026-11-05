import { render } from '@testing-library/react-native';
import NativeTabLayout from '../src/app/(tabs)/_layout.ios';
import { useSettingsStore } from '../src/store/useSettingsStore';

jest.mock('expo-router', () => ({
  Slot: () => {
    const { View } = require('react-native');
    return <View testID="slot" />;
  },
}));

jest.mock('expo-router/native-tabs', () => {
  const { View, Text } = require('react-native');
  const Trigger = (props: Record<string, unknown>) => (
    <View testID={`trigger-${props.name}`} {...props} />
  );
  Trigger.Label = (props: Record<string, unknown>) => <Text {...props} />;
  Trigger.Icon = (props: Record<string, unknown>) => <View {...props} />;
  return {
    NativeTabs: Object.assign(
      (props: Record<string, unknown>) => (
        <View testID="native-tabs" {...props} />
      ),
      { Trigger },
    ),
  };
});

describe('NativeTabLayout (iOS)', () => {
  beforeEach(() => {
    useSettingsStore.getState().resetSettings();
  });

  test('renders NativeTabs with disableScrollToTop on index trigger when enabled', async () => {
    useSettingsStore.setState({ useNativeIOSBottomTabs: true });
    const host = await render(<NativeTabLayout />);

    expect(host.getByTestId('native-tabs')).toBeTruthy();
    const indexTrigger = host.getByTestId('trigger-index');
    expect(indexTrigger.props.disableScrollToTop).toBe(true);
    expect(host.getByTestId('trigger-profile')).toBeTruthy();
  });

  test('renders Slot fallback when useNativeIOSBottomTabs is false', async () => {
    useSettingsStore.setState({ useNativeIOSBottomTabs: false });
    const host = await render(<NativeTabLayout />);

    expect(host.getByTestId('slot')).toBeTruthy();
    expect(host.queryByTestId('native-tabs')).toBeNull();
  });
});
