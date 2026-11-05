import { fireEvent, render } from '@testing-library/react-native';
import { ImagePreviewModal } from '../src/components/ImagePreviewModal';
import { saveImageToGallery } from '../src/utils/saveImage';

jest.mock('../src/utils/nativeImageViewer', () => ({
  isNativeImageViewerAvailable: () => false,
}));
jest.mock('react-native-pager-view', () => ({
  __esModule: true,
  default: jest.requireActual('react-native').View,
}));
jest.mock('../src/components/navigation/GlassNavigationButton', () => ({
  GlassNavigationButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: ({
    visible,
    imageUrl,
  }: {
    visible: boolean;
    imageUrl: string | null;
  }) => {
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? <Text testID="image-action-sheet">{imageUrl}</Text> : null;
  },
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
}));
jest.mock('../src/utils/saveImage', () => ({ saveImageToGallery: jest.fn() }));

const urls = ['https://example.test/a.jpg', 'https://example.test/b.jpg'];
const originals = ['https://example.test/original.jpg', undefined] as const;

beforeEach(() => jest.clearAllMocks());

async function show() {
  const onClose = jest.fn();
  const host = await render(
    <ImagePreviewModal
      visible
      imageUrls={urls}
      originalUrls={originals}
      initialIndex={1}
      onClose={onClose}
    />,
  );
  const layout = host.container.queryAll(
    (node) => typeof node.props.onLayout === 'function',
  )[0];
  await fireEvent(layout, 'layout', {
    nativeEvent: { layout: { width: 320, height: 640 } },
  });
  return { ...host, onClose };
}

test('opens at the requested page and saves the currently selected original', async () => {
  const host = await show();
  expect(host.getByText('2 / 2')).toBeTruthy();
  const pager = host.container.queryAll(
    (node) => typeof node.props.onPageSelected === 'function',
  )[0];
  expect(pager.props.initialPage).toBe(1);
  await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 0 } });
  expect(host.getByText('1 / 2')).toBeTruthy();
  await fireEvent.press(host.getByLabelText('保存图片'));
  expect(saveImageToGallery).toHaveBeenCalledWith(originals[0]);
});

test('reopening starts the pager, indicator and save action at the new initial page', async () => {
  const host = await show();
  const pager = host.container.queryAll(
    (node) => typeof node.props.onPageSelected === 'function',
  )[0];
  await fireEvent(pager, 'pageSelected', { nativeEvent: { position: 0 } });
  await host.rerender(
    <ImagePreviewModal
      visible={false}
      imageUrls={urls}
      onClose={host.onClose}
    />,
  );
  await host.rerender(
    <ImagePreviewModal
      visible
      imageUrls={urls}
      originalUrls={originals}
      initialIndex={1}
      onClose={host.onClose}
    />,
  );
  const layout = host.container.queryAll(
    (node) => typeof node.props.onLayout === 'function',
  )[0];
  await fireEvent(layout, 'layout', {
    nativeEvent: { layout: { width: 320, height: 640 } },
  });
  const reopenedPager = host.container.queryAll(
    (node) => typeof node.props.onPageSelected === 'function',
  )[0];
  expect(reopenedPager.props.initialPage).toBe(1);
  expect(host.getByText('2 / 2')).toBeTruthy();
  await fireEvent.press(host.getByLabelText('保存图片'));
  expect(saveImageToGallery).toHaveBeenCalledWith(urls[1]);
});

test('long press uses the original and zoom disables page swiping', async () => {
  const host = await show();
  const images = host.container.queryAll((node) => node.type === 'Image');
  expect(images[0].props.source).toEqual({
    uri: originals[0],
    cache: 'force-cache',
  });
  const pager = host.container.queryAll(
    (node) => typeof node.props.onPageSelected === 'function',
  )[0];
  const scroll = host.container.queryAll(
    (node) => typeof node.props.onScroll === 'function',
  )[0];
  await fireEvent(scroll, 'scroll', { nativeEvent: { zoomScale: 2 } });
  expect(pager.props.scrollEnabled).toBe(false);
  await fireEvent(scroll, 'scroll', { nativeEvent: { zoomScale: 1 } });
  expect(pager.props.scrollEnabled).toBe(true);
  await fireEvent(images[0], 'longPress');
  expect(host.getByTestId('image-action-sheet')).toHaveTextContent(
    originals[0],
  );
  await fireEvent.press(host.getByLabelText('关闭'));
  expect(host.onClose).toHaveBeenCalledTimes(1);
});

test('long images are displayed at full width and can scroll vertically', async () => {
  const host = await show();
  const image = host.container.queryAll((node) => node.type === 'Image')[0];
  await fireEvent(image, 'load', {
    nativeEvent: { source: { width: 100, height: 1000 } },
  });
  expect(
    host.container.queryAll((node) => node.props.style?.height === 3200),
  ).not.toHaveLength(0);
});
