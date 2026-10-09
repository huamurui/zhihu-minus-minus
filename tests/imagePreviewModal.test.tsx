import { fireEvent, render } from '@testing-library/react-native';
import type React from 'react';
import { Animated, Image } from 'react-native';
import type ImageViewer from 'react-native-image-zoom-viewer';
import { ImagePreviewModal } from '../components/ImagePreviewModal';
import { saveImageToGallery } from '../utils/saveImage';

type ViewerProps = React.ComponentProps<typeof ImageViewer>;
const mockViewerProps: ViewerProps[] = [];

jest.mock('react-native-image-zoom-viewer', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const ActualViewer = jest.requireActual<
    typeof import('react-native-image-zoom-viewer')
  >('react-native-image-zoom-viewer').default;
  return {
    __esModule: true,
    default: (props: ViewerProps) => {
      mockViewerProps.push(props);
      return React.createElement(ActualViewer, props);
    },
  };
});
jest.mock('react-native-image-pan-zoom', () => ({
  __esModule: true,
  default: jest.requireActual('react-native').View,
}));
jest.mock('../components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: () => null,
}));
jest.mock('../components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('../utils/saveImage', () => ({ saveImageToGallery: jest.fn() }));

beforeEach(() => {
  mockViewerProps.length = 0;
  jest.clearAllMocks();
  jest.spyOn(Image, 'getSize').mockImplementation((_uri, success) => {
    success(640, 480);
  });
  jest.spyOn(Image, 'prefetch').mockResolvedValue(true);
  jest.spyOn(Animated, 'timing').mockImplementation(() => ({
    start: (callback) => callback?.({ finished: true }),
    stop: jest.fn(),
    reset: jest.fn(),
  }));
});

afterEach(() => {
  jest.restoreAllMocks();
});

function latestViewerProps() {
  return mockViewerProps[mockViewerProps.length - 1];
}

test('reopening a loaded image reuses its original dimensions without another getSize or prefetch', async () => {
  const imageUrls = ['https://example.test/reopened.jpg'];
  const onClose = jest.fn();
  const view = (visible: boolean) => (
    <ImagePreviewModal
      visible={visible}
      imageUrls={imageUrls}
      onClose={onClose}
    />
  );
  const host = await render(view(true));
  expect(Image.getSize).toHaveBeenCalledTimes(1);
  const image = host.container.queryAll((node) => node.type === 'Image')[0];
  expect(image).toBeTruthy();
  expect(image.props.source).toEqual({
    uri: imageUrls[0],
    cache: 'force-cache',
  });
  await fireEvent(image, 'load', {
    nativeEvent: {
      source: { width: 1280, height: 960, uri: imageUrls[0] },
    },
  });

  await host.rerender(view(false));
  await host.rerender(view(true));
  expect(latestViewerProps().imageUrls[0]).toMatchObject({
    url: imageUrls[0],
    width: 1280,
    height: 960,
  });
  expect(Image.getSize).toHaveBeenCalledTimes(1);
  expect(Image.prefetch).not.toHaveBeenCalled();
  expect(host.container.queryAll((node) => node.type === 'Image')).toHaveLength(
    1,
  );
  await host.unmount();
  await render(view(true));
  expect(Image.getSize).toHaveBeenCalledTimes(1);
});

test('changing a URL while open loads the new image without reusing previous dimensions', async () => {
  const firstUrl = 'https://example.test/changed.jpg?version=1';
  const secondUrl = 'https://example.test/changed.jpg?version=2';
  const onClose = jest.fn();
  const view = (url: string) => (
    <ImagePreviewModal visible imageUrls={[url]} onClose={onClose} />
  );
  const host = await render(view(firstUrl));
  await fireEvent(
    host.container.queryAll((node) => node.type === 'Image')[0],
    'load',
    { nativeEvent: { source: { width: 800, height: 600 } } },
  );

  await host.rerender(view(secondUrl));
  expect(Image.getSize).toHaveBeenCalledTimes(2);
  expect(Image.getSize).toHaveBeenLastCalledWith(
    secondUrl,
    expect.any(Function),
    expect.any(Function),
  );
  expect(latestViewerProps().imageUrls[0].width).toBeUndefined();
  expect(latestViewerProps().imageUrls[0].height).toBeUndefined();
  expect(
    host.container.queryAll((node) => node.type === 'Image')[0].props.source,
  ).toEqual({ uri: secondUrl, cache: 'force-cache' });
});

test('cached rendering preserves onLoad and ignores invalid dimensions', async () => {
  const uri = 'https://example.test/callback.jpg';
  const onLoad = jest.fn();
  const onClose = jest.fn();
  const host = await render(
    <ImagePreviewModal visible imageUrls={[uri]} onClose={onClose} />,
  );
  const renderImage = latestViewerProps().renderImage;
  if (!renderImage) throw new Error('Expected a cached image renderer');
  const imageHost = await render(
    renderImage({ source: { uri, width: 900, height: 600 }, onLoad }),
  );
  expect(
    imageHost.container.queryAll((node) => node.type === 'Image')[0].props
      .source,
  ).toEqual({ uri, width: 900, height: 600, cache: 'force-cache' });
  const event = { nativeEvent: { source: { width: 0, height: 0 } } };
  await fireEvent(
    imageHost.container.queryAll((node) => node.type === 'Image')[0],
    'load',
    event,
  );
  expect(onLoad).toHaveBeenCalledWith(event);
  await host.rerender(
    <ImagePreviewModal visible={false} imageUrls={[uri]} onClose={onClose} />,
  );
  await host.rerender(
    <ImagePreviewModal visible imageUrls={[uri]} onClose={onClose} />,
  );
  expect(latestViewerProps().imageUrls[0].width).toBeUndefined();
  expect(Image.getSize).toHaveBeenCalledTimes(2);
});

test('first opening stays usable and close and save still target the current image', async () => {
  const imageUrls = [
    'https://example.test/actions-first.jpg',
    'https://example.test/actions-second.jpg',
  ];
  const onClose = jest.fn();
  const host = await render(
    <ImagePreviewModal
      visible
      imageUrls={imageUrls}
      initialIndex={1}
      onClose={onClose}
    />,
  );
  expect(Image.getSize).toHaveBeenCalledWith(
    imageUrls[1],
    expect.any(Function),
    expect.any(Function),
  );
  expect(host.getByText('2 / 2')).toBeTruthy();
  const buttons = host.container.queryAll((node) => node.props.hitSlop === 12);
  expect(buttons).toHaveLength(2);
  await fireEvent.press(buttons[0]);
  expect(onClose).toHaveBeenCalledTimes(1);
  await fireEvent.press(buttons[1]);
  expect(saveImageToGallery).toHaveBeenCalledWith(imageUrls[1]);
  expect(latestViewerProps().enablePreload).toBe(false);
  await host.rerender(
    <ImagePreviewModal
      visible
      imageUrls={[imageUrls[0]]}
      initialIndex={1}
      onClose={onClose}
    />,
  );
  expect(latestViewerProps().index).toBe(0);
  const updatedButtons = host.container.queryAll(
    (node) => node.props.hitSlop === 12,
  );
  await fireEvent.press(updatedButtons[1]);
  expect(saveImageToGallery).toHaveBeenLastCalledWith(imageUrls[0]);
});
