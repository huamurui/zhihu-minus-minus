import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Animated, Platform, Text } from 'react-native';
import { AppDialog } from '../src/components/overlays/AppDialog';
import { BottomSheet } from '../src/components/overlays/BottomSheet';
import {
  PaneContext,
  PaneVisibilityContext,
  usePaneDimensions,
  usePaneVisible,
} from '../src/features/adaptive-layout/PaneContext';
import { PaneModal } from '../src/features/adaptive-layout/PaneModal';

let mockFinishAnimation: (finished: boolean) => void;

jest.mock('expo-router', () => ({ useIsFocused: () => true }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useThemeColor: () => '#336699',
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: 1200, height: 800, scale: 2, fontScale: 1 }),
}));
jest.mock('react-native-gesture-handler', () => {
  const gesture = {
    enabled: () => gesture,
    activeOffsetY: () => gesture,
    failOffsetX: () => gesture,
    onUpdate: () => gesture,
    onEnd: () => gesture,
    onFinalize: () => gesture,
  };
  return {
    Gesture: { Pan: () => gesture },
    GestureDetector: ({ children }: PropsWithChildren) => children,
  };
});
jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: { View: jest.requireActual('react-native').View },
    useSharedValue: (value: number) => react.useRef({ value }).current,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: (value: number) => value,
    withTiming: (
      value: number,
      _config: unknown,
      callback?: (finished: boolean) => void,
    ) => {
      if (callback) mockFinishAnimation = callback;
      return value;
    },
    runOnJS: (callback: () => void) => callback,
  };
});

beforeEach(() => {
  jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => callback?.({ finished: true }),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
  jest.spyOn(Animated, 'spring').mockImplementation(() => ({
    start: (callback) => callback?.({ finished: true }),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});

afterEach(() => jest.restoreAllMocks());

function DimensionsProbe() {
  const { width } = usePaneDimensions();
  const visible = usePaneVisible();
  return <Text>{`${width}:${visible}`}</Text>;
}

test('a hidden pane suspends its dialog and restores its scroll position without closing it', async () => {
  const onClose = jest.fn();
  const view = (visible: boolean) => (
    <PaneContext.Provider value={{ width: 360, height: 800, visible }}>
      <AppDialog visible title="对话框" onClose={onClose}>
        <DimensionsProbe />
      </AppDialog>
    </PaneContext.Provider>
  );
  const host = await render(view(true));
  expect(host.getByText('1200:true')).toBeTruthy();
  const scroll = host.container.queryAll(
    (node) => node.props.contentOffset !== undefined,
  )[0];
  await fireEvent.scroll(scroll, {
    nativeEvent: { contentOffset: { x: 0, y: 230 } },
  });

  await host.rerender(view(false));
  expect(host.queryByText('对话框')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();

  await host.rerender(view(true));
  expect(host.getByText('对话框')).toBeTruthy();
  expect(
    host.container.queryAll((node) => node.props.contentOffset !== undefined)[0]
      .props.contentOffset,
  ).toEqual({ x: 0, y: 230 });
  expect(onClose).not.toHaveBeenCalled();
});

test('a hidden pane suspends and reopens its bottom sheet without requesting dismissal', async () => {
  const onClose = jest.fn();
  const view = (visible: boolean) => (
    <PaneContext.Provider value={{ width: 360, height: 800, visible }}>
      <BottomSheet visible title="菜单" onClose={onClose}>
        <DimensionsProbe />
      </BottomSheet>
    </PaneContext.Provider>
  );
  const host = await render(view(true));
  expect(host.getByText('1200:true')).toBeTruthy();
  await host.rerender(view(false));
  expect(host.queryByText('菜单')).toBeNull();
  await host.rerender(view(true));
  expect(host.getByText('菜单')).toBeTruthy();
  expect(host.getByText('1200:true')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('modal descendants retain their ancestor visibility after pane bounds are reset', async () => {
  const view = (visible: boolean) => (
    <PaneVisibilityContext.Provider value={visible}>
      <PaneContext.Provider value={null}>
        <PaneModal visible>
          <Text>嵌套菜单</Text>
        </PaneModal>
      </PaneContext.Provider>
    </PaneVisibilityContext.Provider>
  );
  const host = await render(view(false));
  expect(host.queryByText('嵌套菜单')).toBeNull();
  await host.rerender(view(true));
  expect(host.getByText('嵌套菜单')).toBeTruthy();
});

test.each(['ios', 'android'] as const)(
  '%s bottom sheet notifies close only after its presentation is gone',
  async (platform) => {
    const previousPlatform = Platform.OS;
    Platform.OS = platform;
    const onClose = jest.fn();
    try {
      const host = await render(
        <BottomSheet visible title="菜单" onClose={onClose}>
          <Text>内容</Text>
        </BottomSheet>,
      );
      const modal = host.container.queryAll(
        (node) =>
          typeof node.props.onDismiss === 'function' &&
          node.props.animationType === 'none',
      )[0];
      const dismissed = modal.props.onDismiss;
      await fireEvent.press(host.getByLabelText('关闭'));
      expect(onClose).not.toHaveBeenCalled();
      await act(() => mockFinishAnimation(true));
      if (platform === 'ios') {
        expect(onClose).not.toHaveBeenCalled();
        await act(() => dismissed());
        expect(onClose).toHaveBeenCalledTimes(1);
        await act(() => dismissed());
      }
      expect(onClose).toHaveBeenCalledTimes(1);
      await host.unmount();
    } finally {
      Platform.OS = previousPlatform;
    }
  },
);
