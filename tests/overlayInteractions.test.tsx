import { act, fireEvent, render } from '@testing-library/react-native';
import type { ForwardedRef, PropsWithChildren } from 'react';
import { ActionSheet } from '../src/components/overlays/ActionSheet';
import { AppDialog } from '../src/components/overlays/AppDialog';

const mockClose = jest.fn();
let mockFinishClose: () => void;

jest.mock('../src/components/overlays/SheetScrollView', () => ({
  SheetScrollView: jest.requireActual('react-native').ScrollView,
}));
jest.mock('../src/components/overlays/BottomSheet', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    BottomSheet: React.forwardRef(
      (
        props: PropsWithChildren<{ visible: boolean; onClose: () => void }>,
        ref: ForwardedRef<{ close: () => void }>,
      ) => {
        React.useImperativeHandle(ref, () => ({ close: mockClose }));
        mockFinishClose = props.onClose;
        return props.visible ? <View>{props.children}</View> : null;
      },
    ),
  };
});
jest.mock(
  '@expo/vector-icons/Ionicons',
  () => jest.requireActual('react-native').View,
);
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useThemeColor: (_props: unknown, token: string) =>
    token === 'onPrimary' ? '#000000' : '#ffffff',
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../src/constants/Colors', () => ({
  __esModule: true,
  default: { light: { textInverse: '#ffffff', text: '#000000' } },
}));
jest.mock('../src/utils/haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Medium: 'medium' },
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 48, bottom: 16, left: 0, right: 0 }),
}));

beforeEach(() => jest.clearAllMocks());

test('a second selection during dismissal cannot replace the first action', async () => {
  const first = jest.fn();
  const second = jest.fn();
  const closed = jest.fn();
  const host = await render(
    <ActionSheet
      visible
      onClose={closed}
      title="合成菜单"
      options={[
        { key: 'first', label: '第一个操作', icon: 'copy', onPress: first },
        { key: 'second', label: '第二个操作', icon: 'trash', onPress: second },
      ]}
    />,
  );
  await fireEvent.press(host.getByText('第一个操作'));
  await fireEvent.press(host.getByText('第二个操作'));
  expect(mockClose).toHaveBeenCalledTimes(1);
  expect(first).not.toHaveBeenCalled();
  await act(() => mockFinishClose());
  expect(closed).toHaveBeenCalledTimes(1);
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
  await host.unmount();
});

test('externally hiding a menu cancels its pending action before reopening', async () => {
  const action = jest.fn();
  const props = {
    onClose: jest.fn(),
    title: '合成菜单',
    options: [
      { key: 'copy', label: '复制', icon: 'copy' as const, onPress: action },
    ],
  };
  const host = await render(<ActionSheet {...props} visible />);
  await fireEvent.press(host.getByText('复制'));
  await host.rerender(<ActionSheet {...props} visible={false} />);
  await host.rerender(<ActionSheet {...props} visible />);
  await act(() => mockFinishClose());
  expect(action).not.toHaveBeenCalled();
  await host.unmount();
});

test('changing the content cancels a queued action and its old close callback', async () => {
  const action = jest.fn();
  const closed = jest.fn();
  const props = {
    visible: true,
    onClose: closed,
    title: '内容操作',
    options: [
      { key: 'copy', label: '复制', icon: 'copy' as const, onPress: action },
    ],
  };
  const host = await render(
    <ActionSheet {...props} actionContextKey="answer:42" />,
  );
  await fireEvent.press(host.getByText('复制'));
  const outgoingClose = mockFinishClose;
  await host.rerender(<ActionSheet {...props} actionContextKey="answer:11" />);
  await act(() => outgoingClose());
  expect(action).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
  expect(host.getByText('复制')).toBeTruthy();
  await host.unmount();
});

test('unmounting during dismissal cancels a queued action', async () => {
  const action = jest.fn();
  const closed = jest.fn();
  const host = await render(
    <ActionSheet
      visible
      onClose={closed}
      title="内容操作"
      options={[{ key: 'copy', label: '复制', icon: 'copy', onPress: action }]}
    />,
  );
  await fireEvent.press(host.getByText('复制'));
  const finish = mockFinishClose;
  await host.unmount();
  await act(() => finish());
  expect(action).not.toHaveBeenCalled();
  expect(closed).not.toHaveBeenCalled();
});

test('primary dialog actions use the runtime foreground for a light accent', async () => {
  const host = await render(
    <AppDialog
      visible
      title="合成对话框"
      actions={[{ label: '确认', variant: 'primary', onPress: jest.fn() }]}
    />,
  );
  expect(host.getByText('确认')).toHaveStyle({ color: '#000000' });
  await host.unmount();
});
