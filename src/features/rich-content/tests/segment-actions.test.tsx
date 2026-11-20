import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import type { ComponentProps } from 'react';
import { ScrollView, View } from 'react-native';
import { createSegmentReaction, reactAnswerSegment } from '@/api/zhihu/answer';
import type { ActionSheetOption } from '@/components/overlays/ActionSheet';
import { ScreenOverlayHost } from '@/components/overlays/ScreenOverlay';
import type { ZhihuSegmentInfo } from '@/types/zhihu';
import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import type { SelectionCommentSheet } from '../components/SelectionCommentSheet';
import { ZhihuContent } from '../components/ZhihuContent';
import type { ZhihuDOMContentProps } from '../components/ZhihuDOMContent';
import type { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import { walkZhihuDocument } from '../documentTraversal';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';

let mockNativeProps: ComponentProps<typeof ZhihuNativeContent>;
let mockDomProps: ZhihuDOMContentProps;
let mockSegmentTapEnabled = true;
let mockPaneActive = true;
let mockCommentSheet: ComponentProps<typeof SelectionCommentSheet>;
let mockOptions: ActionSheetOption[] = [];
const mockPush = jest.fn();

jest.mock('@expo/vector-icons/Ionicons', () => () => null);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/features/adaptive-layout/PaneContext', () => ({
  usePaneActive: () => mockPaneActive,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 12, left: 0, right: 0 }),
}));
jest.mock('@/components/ContentActionBar', () => ({
  CONTENT_ACTION_BAR_HEIGHT: 52,
  getContentActionBarBottom: () => 24,
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/api/client', () => ({ __esModule: true, default: {} }));
jest.mock('../../../api/zhihu/answer', () => ({
  getAnswer: jest.fn(),
  createSegmentReaction: jest.fn(),
  reactAnswerSegment: jest.fn(async () => ({})),
  unreactAnswerSegment: jest.fn(async () => ({})),
}));
jest.mock('../../../api/zhihu/article', () => ({ getArticle: jest.fn() }));
jest.mock('../../../api/zhihu/pin', () => ({ getPin: jest.fn() }));
jest.mock('../../../api/zhihu/question', () => ({ getQuestion: jest.fn() }));
jest.mock('../components/SelectionCommentSheet', () => ({
  SelectionCommentSheet: (
    props: ComponentProps<typeof SelectionCommentSheet>,
  ) => {
    mockCommentSheet = props;
    const { Text } =
      jest.requireActual<typeof import('react-native')>('react-native');
    return <Text>正在编辑划线评论</Text>;
  },
}));
jest.mock('../../../utils/toast', () => ({ showToast: jest.fn() }));
jest.mock('../../../components/ImageActionBottomSheet', () => ({
  ImageActionBottomSheet: () => null,
}));
jest.mock('../../../components/ImagePreviewModal', () => ({
  ImagePreviewModal: () => null,
}));
jest.mock('../../../components/BouncyButton', () => ({
  BouncyButton: () => null,
}));
jest.mock('../../../components/overlays/ActionSheet', () => ({
  ActionSheet: ({
    visible,
    options,
  }: {
    visible: boolean;
    options: ActionSheetOption[];
  }) => {
    if (visible) mockOptions = options;
    return null;
  },
}));
jest.mock('../../../components/Themed', () => {
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Text: native.Text,
    View: native.View,
    useRuntimeThemeColors: () => ({ onPrimary: '#fff' }),
    useThemeColor: () => '#222',
  };
});
jest.mock('../../../components/useColorScheme', () => ({
  useColorScheme: () => 'light',
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({
    richContentRenderer: 'native-v2',
    enableSegmentTap: mockSegmentTapEnabled,
    fontSizeScale: 1,
    lineHeightScale: 1.5,
  }),
}));
jest.mock(
  '../components/ZhihuDOMContent',
  () => (props: ZhihuDOMContentProps) => {
    mockDomProps = props;
    return null;
  },
);
jest.mock('../components/ZhihuNativeContent', () => ({
  isRichTextNativeAvailable: () => true,
  ZhihuNativeContent: (props: ComponentProps<typeof ZhihuNativeContent>) => {
    mockNativeProps = props;
    return null;
  },
}));

const sourceHtml =
  '<p data-pid="p-one">甲<span class="highlight-wrap">乙😀</span>丙</p>';
const segment: ZhihuSegmentInfo = {
  pid: 'p-one',
  text: '甲乙😀丙',
  marks: [
    {
      start_index: 1,
      end_index: 4,
      seg_info: {
        seg_ids: ['200'],
        is_like: false,
        like_count: 8,
        comment_count: 2,
      },
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockOptions = [];
  mockSegmentTapEnabled = true;
  mockPaneActive = true;
});

it.each(['webview', 'native-v2'] as const)(
  'keeps %s selection actions in the current viewport outside the scrolling body and discards inactive selections',
  async (renderer) => {
    const client = new QueryClient({
      defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
    });
    const html = '<p data-pid="p-one">甲乙😀丙</p>';
    const page = (objectId = '42', selectable = true) => (
      <QueryClientProvider client={client}>
        <View testID="other-pane">
          <ScreenOverlayHost />
        </View>
        <View testID="reading-pane">
          <ScreenOverlayHost>
            <ScrollView testID="scroll-body">
              <ZhihuContent
                content={html}
                objectId={objectId}
                type="answer"
                renderer={renderer}
                selectable={selectable}
                segmentInfos={[segment]}
              />
            </ScrollView>
          </ScreenOverlayHost>
        </View>
      </QueryClientProvider>
    );
    const selection = {
      text: '乙😀',
      startParagraphId: 'p-one',
      endParagraphId: 'p-one',
      startOffset: 1,
      endOffset: 4,
    };
    const select = () => {
      if (renderer === 'webview') {
        const callback = mockDomProps.onTextSelected;
        return () => callback?.(selection);
      }
      const callback = mockNativeProps.onSelectionChange;
      const document = normalizeZhihuDocument(html, {
        documentId: 'answer:42',
      }).document;
      const part = compileZhihuDocument(document, {
        fontSize: 17,
        lineHeight: 25,
      }).parts.find((item) => item.type === 'flow');
      if (part?.type !== 'flow') throw new Error('Missing test flow');
      const { flow } = part;
      return () =>
        callback?.(
          {
            start: 1,
            end: 4,
            flowId: flow.id,
            textVersion: flow.textVersion,
            mapping: mapRichTextSelection(flow, 1, 4),
          },
          flow,
          document,
        );
    };
    const host = await render(page());
    const reading = within(host.getByTestId('reading-pane'));
    const originalSelect = select();
    await act(originalSelect);
    expect(reading.getByText(selection.text)).toBeOnTheScreen();
    expect(
      within(host.getByTestId('scroll-body')).queryByText('赞同'),
    ).toBeNull();
    expect(
      within(host.getByTestId('other-pane')).queryByText('赞同'),
    ).toBeNull();
    await fireEvent.press(reading.getByLabelText('取消选区操作'));
    expect(reading.queryByLabelText('赞同所选文字')).toBeNull();
    expect(createSegmentReaction).not.toHaveBeenCalled();

    await act(originalSelect);
    await fireEvent.press(reading.getByLabelText('评论所选文字'));
    expect(mockCommentSheet).toMatchObject({ answerId: '42', selection });
    expect(reading.getByText('正在编辑划线评论')).toBeOnTheScreen();
    expect(reading.queryByLabelText('赞同所选文字')).toBeNull();
    expect(createSegmentReaction).not.toHaveBeenCalled();
    await act(() => mockCommentSheet.onClose());
    expect(reading.queryByText('正在编辑划线评论')).toBeNull();

    await act(originalSelect);
    await host.rerender(page('42', false));
    expect(
      (renderer === 'webview' ? mockDomProps : mockNativeProps).selectable,
    ).toBe(false);
    await act(originalSelect);
    expect(reading.queryByText(selection.text)).toBeNull();
    await host.rerender(page());
    await act(originalSelect);
    expect(reading.queryByText(selection.text)).toBeNull();

    await act(select());
    const previousAnswer = select();
    await host.rerender(page('43'));
    await act(previousAnswer);
    expect(reading.queryByText(selection.text)).toBeNull();
    await host.rerender(page());
    await act(select());
    const beforeLeaving = select();
    mockPaneActive = false;
    await host.rerender(page());
    await act(beforeLeaving);
    expect(reading.queryByText(selection.text)).toBeNull();
    mockPaneActive = true;
    await host.rerender(page());
    await act(beforeLeaving);
    expect(reading.queryByText(selection.text)).toBeNull();

    await act(select());
    await fireEvent.press(reading.getByLabelText('赞同所选文字'));
    await waitFor(() => {
      expect(createSegmentReaction).toHaveBeenCalledWith(
        '42',
        selection.text,
        'p-one',
        1,
        'p-one',
        4,
      );
      expect(reading.queryByLabelText('赞同所选文字')).toBeNull();
    });
    client.clear();
  },
);

it('keeps selection, links and exact WebView ranges when answer segment taps are disabled', async () => {
  const client = new QueryClient();
  mockSegmentTapEnabled = false;
  const page = (renderer: 'native-v2' | 'webview') => (
    <QueryClientProvider client={client}>
      <ZhihuContent
        content={sourceHtml}
        segmentInfos={[segment]}
        objectId="42"
        type="answer"
        renderer={renderer}
      />
    </QueryClientProvider>
  );
  const host = await render(page('native-v2'));
  expect(mockNativeProps.onSegmentPress).toBeUndefined();
  expect(mockNativeProps.onSelectionChange).toBeInstanceOf(Function);
  expect(mockNativeProps.onLinkPress).toBeInstanceOf(Function);
  await host.rerender(page('webview'));
  expect(mockDomProps.segmentTapEnabled).toBe(false);
  expect(mockDomProps.onTextSelected).toBeInstanceOf(Function);
  const nodeId = mockDomProps.segmentParagraphs?.get(segment.pid)
    ?.annotations[0].run.id;
  expect(nodeId).toBeTruthy();
  await act(() => mockDomProps.onSegmentPress?.(segment.pid, nodeId));
  expect(mockOptions).toEqual([]);
  mockSegmentTapEnabled = true;
  await host.rerender(page('native-v2'));
  await host.rerender(page('webview'));
  await act(() => mockDomProps.onSegmentPress?.(segment.pid, nodeId));
  expect(mockOptions.find((option) => option.key === 'comments')?.label).toBe(
    '2 评论',
  );
  client.clear();
});

it('offers working copy, reaction and comments actions for a visual highlight with exact API metadata', async () => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false, gcTime: Infinity } },
  });
  await render(
    <QueryClientProvider client={client}>
      <ZhihuContent
        content={sourceHtml}
        segmentInfos={[segment]}
        objectId="42"
        type="answer"
      />
    </QueryClientProvider>,
  );
  const document = normalizeZhihuDocument(sourceHtml, {
    documentId: 'answer:42',
    segmentInfos: [segment],
  }).document;
  const run = [...walkZhihuDocument(document)].find(
    (node) => node.type === 'segmentHighlight',
  );
  if (run?.type !== 'segmentHighlight') throw new Error('Missing highlight');
  await act(() => {
    mockNativeProps.onSegmentPress?.(
      {
        nodeId: run.id,
        paragraphId: 'p-one',
        start: 1,
        end: 4,
        text: '乙😀',
        segment: run,
      },
      document,
    );
  });
  expect(mockOptions.map((option) => option.key)).toEqual([
    'like',
    'comments',
    'copy',
    'discussion',
  ]);
  const copy = mockOptions.find((option) => option.key === 'copy');
  const comments = mockOptions.find((option) => option.key === 'comments');
  const like = mockOptions.find((option) => option.key === 'like');
  if (!copy || !comments || !like) throw new Error('Missing segment actions');
  expect(like.disabled).toBe(false);
  expect(comments.disabled).toBe(false);
  await act(async () => {
    await copy.onPress();
  });
  expect(Clipboard.setStringAsync).toHaveBeenCalledWith('乙😀');
  await act(() => {
    comments.onPress();
  });
  expect(mockPush).toHaveBeenCalledWith(
    '/comments/42?type=answer&segmentId=200&pid=p-one&startOffset=1&endOffset=4&text=%E4%B9%99%F0%9F%98%80',
  );
  await act(() => {
    like.onPress();
  });
  await waitFor(() => {
    expect(reactAnswerSegment).toHaveBeenCalledWith(
      '42',
      ['200'],
      '乙😀',
      'p-one',
      1,
      4,
    );
  });
  client.clear();
});

it.each([
  '<p data-pid="p-one">新正文<br>另一句</p>',
  '<p data-pid="p-one">甲乙😀丙</p><p data-pid="p-one">另一句</p>',
])(
  'ignores stale or paragraph-only WebView segment taps for ambiguous source %s',
  async (content) => {
    const client = new QueryClient();
    const page = (html: string) => (
      <QueryClientProvider client={client}>
        <ZhihuContent
          content={html}
          segmentInfos={[segment]}
          objectId="42"
          type="answer"
          renderer="webview"
        />
      </QueryClientProvider>
    );
    const host = await render(page(sourceHtml));
    const knownId = mockDomProps.segmentParagraphs?.get(segment.pid)
      ?.annotations[0].run.id;
    expect(knownId).toBeTruthy();
    await act(() => mockDomProps.onSegmentPress?.(segment.pid));
    expect(mockOptions).toEqual([]);
    await host.rerender(page(content));
    expect(mockDomProps.segmentParagraphs?.has(segment.pid)).toBe(false);
    await act(() => {
      mockDomProps.onSegmentPress?.(segment.pid);
      mockDomProps.onSegmentPress?.(segment.pid, knownId);
    });
    expect(mockOptions).toEqual([]);
    expect(mockPush).not.toHaveBeenCalled();
    client.clear();
  },
);
