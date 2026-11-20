import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  userEvent,
  waitFor,
  within,
} from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { type PropsWithChildren, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import { withSpring } from 'react-native-reanimated';
import { createAnswerSelectionComment } from '../src/api/zhihu/comment';
import { uploadImage } from '../src/api/zhihu/image';
import { AppDialog } from '../src/components/overlays/AppDialog';
import { BottomSheet } from '../src/components/overlays/BottomSheet';
import {
  ScreenOverlay,
  ScreenOverlayHost,
} from '../src/components/overlays/ScreenOverlay';
import {
  PaneContext,
  PaneVisibilityContext,
  usePaneActive,
  usePaneDimensions,
  usePaneVisible,
} from '../src/features/adaptive-layout/PaneContext';
import { PaneModal } from '../src/features/adaptive-layout/PaneModal';
import { SelectionCommentSheet } from '../src/features/rich-content/components/SelectionCommentSheet';
import { useSettingsStore } from '../src/store/useSettingsStore';

let mockFinishAnimation: (finished: boolean) => void;
let mockFocused = true;
let mockWindowHeight = 800;

jest.mock('../src/api/zhihu/comment', () => ({
  createAnswerSelectionComment: jest.fn(),
}));
jest.mock('../src/api/zhihu/image', () => ({ uploadImage: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
  View: jest.requireActual('react-native').View,
  useThemeColor: () => '#336699',
  useRuntimeThemeColors: () => ({ text: '#111', link: '#234', border: '#ddd' }),
}));
jest.mock('../src/components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
}));
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({
    width: 1200,
    height: mockWindowHeight,
    scale: 2,
    fontScale: 1,
  }),
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
  type MockTiming = { target: number; callback: (finished: boolean) => void };
  function useSharedValue(initial: number) {
    const [shared] = react.useState(() => {
      let value = initial;
      let pending: MockTiming | undefined;
      const finish = (finished: boolean) => {
        const animation = pending;
        pending = undefined;
        animation?.callback(finished);
      };
      return {
        get value() {
          return value;
        },
        set value(next: number | MockTiming) {
          // Assigning to an animating shared value cancels its previous animation.
          finish(false);
          if (typeof next === 'number') {
            value = next;
          } else {
            value = next.target;
            pending = next;
            mockFinishAnimation = finish;
          }
        },
      };
    });
    return shared;
  }
  return {
    __esModule: true,
    default: { View: jest.requireActual('react-native').View },
    useSharedValue,
    useAnimatedStyle: (style: () => object) => style(),
    withSpring: jest.fn((value: number) => value),
    withTiming: (
      value: number,
      _config: unknown,
      callback?: (finished: boolean) => void,
    ) => (callback ? { target: value, callback } : value),
    runOnJS: (callback: () => void) => callback,
  };
});

beforeEach(() => {
  mockFocused = true;
  mockWindowHeight = 800;
  useSettingsStore.setState({ largeScreenLayoutMode: 'single' });
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

function ModalSelectionProbe() {
  const active = usePaneActive();
  const { width } = usePaneDimensions();
  return <Text>{`${width}:${active}`}</Text>;
}

test('a visible pane beside the focused detail keeps its modal selection active at window size', async () => {
  mockFocused = false;
  const host = await render(
    <PaneContext.Provider value={{ width: 360, height: 800, visible: true }}>
      <PaneModal>
        <ModalSelectionProbe />
      </PaneModal>
    </PaneContext.Provider>,
  );
  expect(host.getByText('1200:true')).toBeOnTheScreen();
});

test('iOS bottom sheets support the landscape presenting window', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const host = await render(
    <PaneContext.Provider value={{ width: 360, height: 800, visible: true }}>
      <DimensionsProbe />
      <BottomSheet visible onClose={jest.fn()}>
        <DimensionsProbe />
      </BottomSheet>
    </PaneContext.Provider>,
  );
  expect(host.getByText('360:true')).toBeOnTheScreen();
  expect(host.getByText('1200:true')).toBeOnTheScreen();
  const modal = host.container.queryAll(
    (node) => node.props.transparent && node.props.visible,
  )[0];
  expect(modal.props.supportedOrientations).toContain('landscape');
});

test.each(['route', 'global'] as const)(
  'iOS %s sheet in dual-pane mode uses a window overlay and can open the next sheet after dismissal',
  async (scope) => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    useSettingsStore.setState({ largeScreenLayoutMode: 'dual' });
    const closed = jest.fn();
    function Sheets() {
      const [step, setStep] = useState(1);
      return (
        <>
          <BottomSheet
            visible={step === 1}
            title="第一个菜单"
            onClose={() => {
              closed();
              setStep(2);
            }}
          >
            <DimensionsProbe />
          </BottomSheet>
          <BottomSheet
            visible={step === 2}
            title="第二个菜单"
            onClose={() => setStep(0)}
          >
            <Text>下一步</Text>
          </BottomSheet>
        </>
      );
    }
    const host = await render(
      <PaneContext.Provider
        value={
          scope === 'global'
            ? null
            : {
                width: 360,
                height: 800,
                visible: true,
                twoPane: true,
              }
        }
      >
        <Text>列表和详情</Text>
        <Sheets />
      </PaneContext.Provider>,
    );
    const overlays = () =>
      host.container.queryAll((node) => node.type === 'RNSFullWindowOverlay');
    expect(overlays()).toHaveLength(1);
    expect(overlays()[0]).toHaveProp('accessibilityContainerViewIsModal', true);
    expect(
      host.container.queryAll((node) => node.type === 'RCTModalHostView'),
    ).toHaveLength(0);
    expect(host.getByText('1200:true')).toBeOnTheScreen();
    if (scope === 'global') {
      await act(() =>
        useSettingsStore.setState({ largeScreenLayoutMode: 'single' }),
      );
      expect(overlays()).toHaveLength(1);
      await act(() =>
        useSettingsStore.setState({ largeScreenLayoutMode: 'dual' }),
      );
    }
    await fireEvent.press(host.getByLabelText('关闭'));
    expect(closed).not.toHaveBeenCalled();
    await act(() => mockFinishAnimation(true));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(host.queryByText('第一个菜单')).toBeNull();
    expect(host.getByText('第二个菜单')).toBeOnTheScreen();
    expect(overlays()).toHaveLength(1);
    await fireEvent.press(host.getByLabelText('关闭'));
    await act(() => mockFinishAnimation(true));
    expect(overlays()).toHaveLength(0);
    expect(host.getByText('列表和详情')).toBeOnTheScreen();
  },
);

test('a new selection replaces the previous reader until another selection is made', async () => {
  const first = {};
  const next = {};
  const page = (owner: object, showNext: boolean) => (
    <ScreenOverlayHost>
      <ScreenOverlay owner={owner}>
        <Text>第一处选区</Text>
      </ScreenOverlay>
      {showNext && (
        <ScreenOverlay owner={next}>
          <Text>第二处选区</Text>
        </ScreenOverlay>
      )}
    </ScreenOverlayHost>
  );
  const host = await render(page(first, false));
  expect(host.getByText('第一处选区')).toBeOnTheScreen();
  await host.rerender(page(first, true));
  expect(host.queryByText('第一处选区')).toBeNull();
  expect(host.getByText('第二处选区')).toBeOnTheScreen();
  await host.rerender(page(first, false));
  expect(host.queryByText('第一处选区')).toBeNull();
  await host.rerender(page({}, false));
  expect(host.getByText('第一处选区')).toBeOnTheScreen();
});

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

test('a hidden pane removes its iOS sheet from the window without requesting dismissal', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const onClose = jest.fn();
  const view = (visible: boolean) => (
    <PaneContext.Provider
      value={{ width: 360, height: 800, visible, twoPane: true }}
    >
      <BottomSheet visible title="菜单" onClose={onClose}>
        <DimensionsProbe />
      </BottomSheet>
    </PaneContext.Provider>
  );
  const host = await render(view(true));
  expect(host.getByText('1200:true')).toBeTruthy();
  await host.rerender(view(false));
  expect(host.queryByText('菜单')).toBeNull();
  expect(
    host.container.queryAll((node) => node.type === 'RNSFullWindowOverlay'),
  ).toHaveLength(0);
  await host.rerender(view(true));
  expect(host.getByText('菜单')).toBeTruthy();
  expect(host.getByText('1200:true')).toBeTruthy();
  expect(onClose).not.toHaveBeenCalled();
});

test('iOS completes a requested sheet dismissal once even when navigation hides the pane during its animation', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  const afterClose = jest.fn();
  const view = (visible: boolean) => (
    <PaneContext.Provider
      value={{ width: 360, height: 800, twoPane: true, visible }}
    >
      <BottomSheet visible title="菜单" onClose={afterClose}>
        <DimensionsProbe />
      </BottomSheet>
    </PaneContext.Provider>
  );
  const host = await render(view(true));
  await fireEvent.press(host.getByLabelText('关闭'));
  await host.rerender(view(false));
  expect(afterClose).not.toHaveBeenCalled();
  expect(host.queryByText('菜单')).toBeNull();
  await act(() => mockFinishAnimation(true));
  expect(afterClose).toHaveBeenCalledTimes(1);
  await host.rerender(view(true));
  expect(host.queryByText('菜单')).toBeNull();
  expect(afterClose).toHaveBeenCalledTimes(1);
});

test('resizing an open sheet preserves it and reopening still plays its entrance', async () => {
  const onClose = jest.fn();
  const view = (visible: boolean) => (
    <BottomSheet visible={visible} title="菜单" onClose={onClose}>
      <Text>内容</Text>
    </BottomSheet>
  );
  const host = await render(view(true));
  jest.mocked(withSpring).mockClear();
  mockWindowHeight = 550;
  await host.rerender(view(true));
  expect(withSpring).not.toHaveBeenCalled();
  expect(host.getByText('内容')).toBeOnTheScreen();

  await host.rerender(view(false));
  await act(() => mockFinishAnimation(true));
  await host.rerender(view(true));
  expect(withSpring).toHaveBeenCalledTimes(1);
  expect(host.getByText('内容')).toBeOnTheScreen();
});

test('iOS finishes a sheet dismissal once when the window resizes during its exit', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios');
  useSettingsStore.setState({ largeScreenLayoutMode: 'dual' });
  const onClose = jest.fn();
  const view = () => (
    <BottomSheet visible title="菜单" onClose={onClose}>
      <Text>内容</Text>
    </BottomSheet>
  );
  const host = await render(view());
  await fireEvent.press(host.getByLabelText('关闭'));
  mockWindowHeight = 550;
  await host.rerender(view());
  expect(onClose).not.toHaveBeenCalled();
  await act(() => mockFinishAnimation(true));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(host.queryByText('菜单')).toBeNull();
});

test.each([
  { width: 320, height: 568, keyboardHeight: 280, scrollHeight: 160 },
  { width: 568, height: 320, keyboardHeight: 180, scrollHeight: 80 },
])(
  'can scroll to and submit a selection comment with 12 images above the keyboard on a $width × $height phone',
  async ({ width, height, keyboardHeight, scrollHeight }) => {
    const selection = {
      text: '选中的原文',
      startParagraphId: 'p1',
      endParagraphId: 'p1',
      startOffset: 0,
      endOffset: 5,
    };
    const assets = Array.from({ length: 12 }, (_, index) => ({
      uri: `file:///preview-${index}.png`,
      width: 40,
      height: 30,
    }));
    jest
      .mocked(ImagePicker.requestMediaLibraryPermissionsAsync)
      .mockResolvedValue({
        granted: true,
      } as ImagePicker.MediaLibraryPermissionResponse);
    jest
      .mocked(ImagePicker.launchImageLibraryAsync)
      .mockResolvedValue({ canceled: false, assets });
    jest
      .mocked(uploadImage)
      .mockImplementation(async ({ uri, width, height }) => ({
        imageId: uri,
        src: 'https://example.com/image.png',
        width,
        height,
      }));
    jest
      .mocked(createAnswerSelectionComment)
      .mockResolvedValue({ id: 'created' });
    const onPosted = jest.fn();
    const host = await render(
      <QueryClientProvider
        client={
          new QueryClient({
            defaultOptions: { mutations: { gcTime: Infinity } },
          })
        }
      >
        <SelectionCommentSheet
          answerId="42"
          selection={selection}
          onClose={jest.fn()}
          onPosted={onPosted}
        />
      </QueryClientProvider>,
    );
    const scroll = host.container.queryAll(
      (node) => node.props.keyboardShouldPersistTaps === 'handled',
    )[0];
    const keyboardArea = host.container.queryAll(
      (node) =>
        typeof node.props.onLayout === 'function' &&
        StyleSheet.flatten(node.props.style)?.paddingBottom === 0,
    )[0];
    await fireEvent(keyboardArea, 'layout', {
      persist: () => {},
      nativeEvent: { layout: { x: 0, y: 0, width, height } },
    });
    await act(() =>
      DeviceEventEmitter.emit('keyboardWillShow', {
        duration: 0,
        endCoordinates: {
          screenX: 0,
          screenY: height - keyboardHeight,
          width,
          height: keyboardHeight,
        },
      }),
    );
    expect(keyboardArea).toHaveStyle({ paddingBottom: keyboardHeight });
    const form = within(scroll);
    expect(form.getByText(selection.text)).toBeOnTheScreen();
    await fireEvent.press(form.getByLabelText('添加图片'));
    expect(await form.findByText('已上传 12 张图片')).toBeOnTheScreen();
    await userEvent.setup().scrollTo(scroll, {
      y: 500 - scrollHeight,
      layoutMeasurement: { width, height: scrollHeight },
      contentSize: { width, height: 500 },
    });
    await fireEvent.changeText(
      form.getByPlaceholderText('写下你的评论…'),
      '附图说明',
    );
    await fireEvent.press(form.getByLabelText('发布评论'));
    await waitFor(() => expect(onPosted).toHaveBeenCalledTimes(1));
    expect(createAnswerSelectionComment).toHaveBeenLastCalledWith(
      '42',
      selection,
      expect.stringContaining('附图说明'),
    );
    expect(
      jest
        .mocked(createAnswerSelectionComment)
        .mock.lastCall?.[2].match(/\[图片\]/g),
    ).toHaveLength(assets.length);
  },
);

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
    if (platform === 'android')
      useSettingsStore.setState({ largeScreenLayoutMode: 'dual' });
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
