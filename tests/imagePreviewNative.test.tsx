import { act, render } from '@testing-library/react-native';
import { ImagePreviewModal } from '../src/components/ImagePreviewModal';
import type { NativeImageViewerEvent } from '../src/utils/nativeImageViewer';
import { saveImageToGallery } from '../src/utils/saveImage';

type Listener = (event: NativeImageViewerEvent) => void;
const mockListeners = new Map<string, Set<Listener>>();
const mockOpen = jest.fn();

jest.mock('../src/utils/nativeImageViewer', () => ({
  isNativeImageViewerAvailable: () => true,
  openNativeImageViewer: (options: unknown) => mockOpen(options),
  addNativeImageViewerListener: (name: string, listener: Listener) => {
    const listeners = mockListeners.get(name) ?? new Set<Listener>();
    listeners.add(listener);
    mockListeners.set(name, listeners);
    return { remove: () => listeners.delete(listener) };
  },
}));
jest.mock('../src/components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: ({
    visible,
    imageUrl,
  }: {
    visible: boolean;
    imageUrl: string | null;
  }) => {
    const { Text: MockText } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return visible ? (
      <MockText testID="image-action-sheet">{imageUrl}</MockText>
    ) : null;
  },
}));
jest.mock('react-native-image-zoom-viewer', () => () => {
  throw new Error('Android must not mount the JavaScript viewer');
});
jest.mock('../src/utils/saveImage', () => ({ saveImageToGallery: jest.fn() }));
jest.mock('../src/components/BouncyButton', () => ({
  BouncyButton: jest.requireActual('react-native').Pressable,
}));
jest.mock('../src/components/Themed', () => ({
  Text: jest.requireActual('react-native').Text,
}));
jest.mock('@expo/vector-icons/Ionicons', () => () => null);

const SHOWN = [
  'https://pic1.zhimg.com/a_720w.jpg',
  'https://pic1.zhimg.com/b_720w.jpg',
];
const ORIGINALS = ['https://pic1.zhimg.com/a_r.jpg', undefined];

function emit(name: string, event: NativeImageViewerEvent) {
  for (const listener of mockListeners.get(name) ?? []) listener(event);
}

beforeEach(() => {
  mockListeners.clear();
  mockOpen.mockReset().mockResolvedValue(7);
  jest.mocked(saveImageToGallery).mockClear();
});

async function show(onClose = jest.fn()) {
  const view = await render(
    <ImagePreviewModal
      visible
      imageUrls={SHOWN}
      originalUrls={ORIGINALS}
      initialIndex={1}
      onClose={onClose}
    />,
  );
  await act(async () => {});
  return { ...view, onClose };
}

test('opens the native viewer once, on originals, from the shown copies', async () => {
  const { rerender, onClose } = await show();
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith({
    urls: ['https://pic1.zhimg.com/a_r.jpg', SHOWN[1]],
    index: 1,
    placeholders: SHOWN,
    saveLabel: '保存图片',
  });
  // Callers rebuild the URL arrays on every render; that must not reopen.
  await rerender(
    <ImagePreviewModal
      visible
      imageUrls={[...SHOWN]}
      originalUrls={[...ORIGINALS]}
      initialIndex={1}
      onClose={onClose}
    />,
  );
  await act(async () => {});
  expect(mockOpen).toHaveBeenCalledTimes(1);
});

test('the save button saves the page the viewer reports', async () => {
  await show();
  await act(async () =>
    emit('onViewerSave', { session: 7, url: 'https://pic1.zhimg.com/a_r.jpg' }),
  );
  expect(saveImageToGallery).toHaveBeenCalledWith(
    'https://pic1.zhimg.com/a_r.jpg',
  );
});

test('a long press shows the action sheet, and closing the viewer closes the preview', async () => {
  const { getByTestId, onClose } = await show();
  await act(async () => {
    emit('onViewerLongPress', { session: 7, url: SHOWN[1] });
    emit('onViewerDismiss', { session: 7 });
  });
  expect(getByTestId('image-action-sheet')).toHaveTextContent(SHOWN[1]);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('events from another viewer session are ignored', async () => {
  const { queryByTestId, onClose } = await show();
  await act(async () => {
    emit('onViewerSave', { session: 6, url: SHOWN[0] });
    emit('onViewerLongPress', { session: 6, url: SHOWN[0] });
    emit('onViewerDismiss', { session: 6 });
  });
  expect(saveImageToGallery).not.toHaveBeenCalled();
  expect(queryByTestId('image-action-sheet')).toBeNull();
  expect(onClose).not.toHaveBeenCalled();
});

test('the preview closes when the viewer cannot open', async () => {
  mockOpen.mockResolvedValue(0);
  const { onClose } = await show();
  expect(onClose).toHaveBeenCalledTimes(1);
});
