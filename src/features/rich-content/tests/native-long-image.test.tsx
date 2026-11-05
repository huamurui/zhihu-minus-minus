import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { RichTextNativeViewProps } from '../../../../modules/zhihu-rich-text';
import type { LongImageCrop } from '../../../utils/nativeImageViewer';
import { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import type { RichTextFlow } from '../richText';

const mockCropLongImage = jest.fn<
  Promise<LongImageCrop | null>,
  [string, number, number]
>();

jest.mock('../../../utils/nativeImageViewer', () => ({
  isNativeImageViewerAvailable: () => true,
  cropLongImage: (url: string, maxAspect: number, targetWidth: number) =>
    mockCropLongImage(url, maxAspect, targetWidth),
}));
jest.mock('../../../../modules/zhihu-rich-text', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isRichTextNativeAvailable: () => true,
    RichTextNativeView: (props: RichTextNativeViewProps) => {
      const flow = JSON.parse(props.flowJson) as RichTextFlow;
      return react.createElement(native.Text, null, flow.text);
    },
  };
});
jest.mock('../../../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    text: '#111111',
    textSecondary: '#666666',
    link: '#0066ff',
    backgroundSecondary: '#eeeeee',
    border: '#dddddd',
  }),
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({ fontSizeScale: 1, lineHeightScale: 1.5 }),
}));
jest.mock('react-native-svg', () => ({ SvgUri: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const SERVED =
  'https://pic1.zhimg.com/v2-0123456789abcdef0123456789abcdef_720w.jpg';
const ORIGINAL =
  'https://pic1.zhimg.com/v2-0123456789abcdef0123456789abcdef_r.jpg';

function figure(width: number, height: number): string {
  return `<figure><img src="data:image/svg+xml;utf8,&lt;svg/&gt;" data-actualsrc="${SERVED}" data-original="${ORIGINAL}" data-rawwidth="${width}" data-rawheight="${height}"></figure>`;
}

async function renderAt(content: string, onImagePress = jest.fn()) {
  await render(
    <ZhihuNativeContent
      content={content}
      objectId="long-image"
      type="answer"
      renderFallback={() => null}
      onImagePress={onImagePress}
    />,
  );
  const container = screen
    .getAllByTestId('native-content-layout', { includeHiddenElements: true })
    .at(-1);
  if (!container) throw new Error('Missing renderer container');
  await fireEvent(container, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 0 } },
  });
  const body = screen
    .getAllByTestId('native-content-body', { includeHiddenElements: true })
    .at(-1);
  if (!body) throw new Error('Missing mounted native body');
  await fireEvent(body, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 0 } },
  });
  return onImagePress;
}

beforeEach(() => {
  mockCropLongImage.mockReset();
});

test('a long image shows its cut top with a 长图 badge', async () => {
  mockCropLongImage.mockResolvedValue({
    uri: 'file:///cache/galeria-long-images/top.jpg',
    cropWidth: 720,
    cropHeight: 1080,
    width: 1080,
    height: 12000,
  });
  await renderAt(figure(1080, 12000));
  await act(async () => {});

  expect(mockCropLongImage).toHaveBeenCalledWith(
    ORIGINAL,
    1.5,
    expect.any(Number),
  );
  const longImage = screen.getByTestId('native-long-image', {
    includeHiddenElements: true,
  });
  // 320 wide at the cut's 720×1080 aspect.
  expect(longImage).toHaveStyle({ width: 320, height: 480 });
  expect(
    screen.getByText('长图', { includeHiddenElements: true }),
  ).toBeTruthy();
});

test('an ordinary image is shown whole and never cut', async () => {
  await renderAt(figure(1080, 1440));
  expect(mockCropLongImage).not.toHaveBeenCalled();
  expect(
    screen.queryByTestId('native-long-image', { includeHiddenElements: true }),
  ).toBeNull();
});

test('a failed cut falls back to the whole image', async () => {
  mockCropLongImage.mockResolvedValue(null);
  await renderAt(figure(1080, 12000));
  await act(async () => {});
  expect(
    screen.queryByTestId('native-long-image', { includeHiddenElements: true }),
  ).toBeNull();
});

test('pressing an image passes the gallery with its originals', async () => {
  mockCropLongImage.mockResolvedValue(null);
  const onImagePress = await renderAt(figure(1080, 1440));
  await fireEvent.press(
    screen.getByLabelText('正文图片', { includeHiddenElements: true }),
  );
  expect(onImagePress).toHaveBeenCalledWith(
    expect.stringContaining('_720w.jpg'),
    [expect.stringContaining('_720w.jpg')],
    [ORIGINAL],
  );
});
