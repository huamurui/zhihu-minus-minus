import { fireEvent, render } from '@testing-library/react-native';
import type { ForwardedRef, PropsWithChildren } from 'react';
import { DoubleTapActionSheet } from '../components/DoubleTapActionSheet';

let mockVisible = true;
const mockUpdateSettings = jest.fn();
const mockHide = jest.fn();

jest.mock('../store/useDoubleTapSetupStore', () => ({
  useDoubleTapSetupStore: (selector: (state: unknown) => unknown) =>
    selector({ visible: mockVisible, hide: mockHide, show: jest.fn() }),
}));
jest.mock('../store/useSettingsStore', () => ({
  useSettingsStore: (selector: (state: unknown) => unknown) =>
    selector({
      updateSettings: mockUpdateSettings,
    }),
}));
jest.mock('../components/overlays/BottomSheet', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BottomSheet: React.forwardRef(
      (
        props: PropsWithChildren<{ visible: boolean; onClose: () => void }>,
        _ref: ForwardedRef<unknown>,
      ) => (props.visible ? <View>{props.children}</View> : null),
    ),
  };
});
jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useThemeColor: (_props: unknown, token: string) =>
    token === 'onPrimary' ? '#000000' : '#ffffff',
}));
jest.mock('../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../constants/Colors', () => ({
  __esModule: true,
  default: {
    light: {
      text: '#000000',
      textSecondary: '#555555',
      backgroundTertiary: '#eeeeee',
      divider: '#dddddd',
    },
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockVisible = true;
});

test('saving the default choice closes the sheet and stores the off action', async () => {
  const host = await render(<DoubleTapActionSheet />);

  expect(host.getByRole('radio', { name: '关闭' })).toBeSelected();
  await fireEvent.press(host.getByRole('button', { name: '保存' }));

  expect(mockUpdateSettings).toHaveBeenCalledWith({ doubleTapAction: 'off' });
  expect(mockHide).toHaveBeenCalledTimes(1);
});

test('saving a picked choice stores exactly that action', async () => {
  const host = await render(<DoubleTapActionSheet />);

  await fireEvent.press(host.getByRole('radio', { name: '打开评论区' }));
  expect(host.getByRole('radio', { name: '打开评论区' })).toBeSelected();
  await fireEvent.press(host.getByRole('button', { name: '保存' }));

  expect(mockUpdateSettings).toHaveBeenCalledWith({
    doubleTapAction: 'comments',
  });
});

test('picking without saving never writes the setting', async () => {
  const host = await render(<DoubleTapActionSheet />);

  await fireEvent.press(host.getByRole('radio', { name: '点赞' }));

  expect(mockUpdateSettings).not.toHaveBeenCalled();
  expect(mockHide).not.toHaveBeenCalled();
});
