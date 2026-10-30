import { act, fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { Image } from 'react-native';
import { ImagePreviewModal } from '../src/components/ImagePreviewModal';
import { saveImageToGallery } from '../src/utils/saveImage';

jest.mock('react-native-webview', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return { WebView: native.View };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('react-native-reanimated', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: { View: native.View },
    useSharedValue: <T,>(value: T) => react.useRef({ value }).current,
    useAnimatedStyle: (callback: () => unknown) => callback(),
    withSpring: (value: number) => value,
    withTiming: (value: number) => value,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

let mockLastLongPressCallback: (() => void) | undefined;
jest.mock('react-native-gesture-handler', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  const gestureChain = () => {
    const self: Record<string, unknown> = {};
    const proxy: Record<string, unknown> = new Proxy(self, {
      get(_target, prop) {
        if (prop === 'onStart') {
          return (cb: () => void) => {
            mockLastLongPressCallback = cb;
            return proxy;
          };
        }
        return () => proxy;
      },
    });
    return proxy;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: native.View,
    Gesture: {
      Tap: gestureChain,
      Pan: gestureChain,
      Pinch: gestureChain,
      LongPress: gestureChain,
      Simultaneous: (..._args: unknown[]) => gestureChain(),
      Exclusive: (..._args: unknown[]) => gestureChain(),
    },
  };
});

jest.mock('../src/components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: ({
    visible,
    imageUrl,
    onClose,
  }: {
    visible: boolean;
    imageUrl: string | null;
    onClose?: () => void;
  }) => {
    const { Text: MockText, Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? (
      <Pressable testID="image-action-sheet" onPress={onClose}>
        <MockText>{imageUrl}</MockText>
      </Pressable>
    ) : null;
  },
}));

jest.mock('../src/utils/saveImage', () => ({
  saveImageToGallery: jest.fn(),
  copyImageUrl: jest.fn(),
}));

jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: ({
    children,
    onPress,
    testID,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    testID?: string;
  }) => {
    const { Pressable } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <Pressable onPress={onPress} testID={testID}>
        {children}
      </Pressable>
    );
  },
}));

jest.mock('../src/utils/saveImage', () => ({
  saveImageToGallery: jest.fn(),
  copyImageUrl: jest.fn(),
}));

jest.mock('../src/components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useThemeColor: () => '#0066FF',
    useRuntimeThemeColors: () => ({
      imageActionSave: '#0066FF',
      imageActionSaveBackground: 'rgba(0,102,255,0.1)',
      imageActionCopy: '#0066FF',
      imageActionCopyBackground: 'rgba(0,102,255,0.1)',
      background: '#FFFFFF',
      surface: '#F5F5F5',
      text: '#000000',
      textSecondary: '#666666',
    }),
  };
});

jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const SHOWN = [
  'https://pic1.zhimg.com/a_720w.jpg',
  'https://pic1.zhimg.com/b_720w.jpg',
];
const ORIGINALS = [
  'https://pic1.zhimg.com/a_r.jpg',
  'https://pic1.zhimg.com/b_r.jpg',
];

describe('ImagePreviewModal', () => {
  beforeAll(() => {
    jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
      success?.(320, 240);
      return Promise.resolve({ width: 320, height: 240 });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not render when visible is false', async () => {
    const host = await render(
      <ImagePreviewModal
        visible={false}
        imageUrls={SHOWN}
        onClose={jest.fn()}
      />,
    );
    expect(host.queryByTestId('image-preview-modal')).toBeNull();
  });

  test('renders image and controls when visible is true', async () => {
    const host = await render(
      <ImagePreviewModal
        visible={true}
        imageUrls={SHOWN}
        originalUrls={ORIGINALS}
        initialIndex={0}
        onClose={jest.fn()}
      />,
    );
    expect(host.getByTestId('image-preview-modal')).toBeTruthy();
    expect(host.getByTestId('preview-close-button')).toBeTruthy();
    expect(host.getByTestId('preview-download-button')).toBeTruthy();
    expect(host.getByTestId('preview-page-indicator')).toBeTruthy();
    expect(host.getByTestId('preview-page-indicator').props.children).toEqual([
      1,
      ' / ',
      2,
    ]);
  });

  test('calls onClose when close button is pressed', async () => {
    const onClose = jest.fn();
    const host = await render(
      <ImagePreviewModal visible={true} imageUrls={SHOWN} onClose={onClose} />,
    );
    fireEvent.press(host.getByTestId('preview-close-button'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('calls saveImageToGallery when download button is pressed', async () => {
    const host = await render(
      <ImagePreviewModal
        visible={true}
        imageUrls={SHOWN}
        originalUrls={ORIGINALS}
        initialIndex={0}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(host.getByTestId('preview-download-button'));
    expect(saveImageToGallery).toHaveBeenCalledWith(ORIGINALS[0]);
  });

  test('renders single image without page indicator', async () => {
    const host = await render(
      <ImagePreviewModal
        visible={true}
        imageUrls={[SHOWN[0]]}
        onClose={jest.fn()}
      />,
    );
    expect(host.getByTestId('image-preview-modal')).toBeTruthy();
    expect(host.queryByTestId('preview-page-indicator')).toBeNull();
  });

  test('long press opens action sheet without closing modal', async () => {
    const onClose = jest.fn();
    const host = await render(
      <ImagePreviewModal
        visible={true}
        imageUrls={[SHOWN[0]]}
        onClose={onClose}
      />,
    );
    expect(host.getByTestId('image-preview-modal')).toBeTruthy();

    // Trigger long press gesture
    await act(async () => {
      mockLastLongPressCallback?.();
    });

    // The modal must still be visible and onClose must NOT have been called!
    expect(host.getByTestId('image-preview-modal')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders LongImageWebView when image is an extreme aspect ratio long image', async () => {
    const host = await render(
      <ImagePreviewModal
        visible={true}
        imageUrls={['https://pic1.zhimg.com/long_image.jpg']}
        imageItems={[
          {
            url: 'https://pic1.zhimg.com/long_image.jpg',
            width: 200,
            height: 8000,
          },
        ]}
        onClose={jest.fn()}
      />,
    );
    expect(host.getByTestId('image-preview-modal')).toBeTruthy();
    expect(host.getByTestId('long-image-container')).toBeTruthy();
    expect(host.getByTestId('long-image-webview')).toBeTruthy();
    expect(host.queryByTestId('preview-image')).toBeNull();
  });
});
