import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { parseDocument } from 'htmlparser2';
import { StyleSheet } from 'react-native';
import type { RichTextNativeViewProps } from '../../../modules/zhihu-rich-text';
import type { ZhihuStructuredContent } from '../../../types/zhihu';
import { compileZhihuDocument, mapRichTextSelection } from '../compileRichText';
import type { ZhihuNativeContentProps } from '../components/ZhihuNativeContent';
import { ZhihuStructuredContent as StructuredRenderer } from '../components/ZhihuStructuredContent';
import type { ZhihuImageResource } from '../document';
import { walkZhihuDocument } from '../documentTraversal';
import nextRenderSegLikeFixture from '../fixtures/cases/next-render-seg-like-001.json';
import { resolveNativeAnswerSegment } from '../nativeInteractions';
import type { RichTextFlow } from '../richText';
import {
  getStructuredContentSegmentInfos,
  parseZhihuStructuredContent,
} from '../structuredContent';
import type { ZhihuContentProps } from '../types';

let mockNativeAvailable = true;
const mockNativeViews = new Map<string, RichTextNativeViewProps>();
const mockNativeInputs: ZhihuNativeContentProps[] = [];
const mockSharedInputs: ZhihuContentProps[] = [];

jest.mock('../../../components/BouncyButton', () => ({
  BouncyButton:
    jest.requireActual<typeof import('react-native')>('react-native').Pressable,
}));

jest.mock('../components/ZhihuContent', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ZhihuContent: (props: ZhihuContentProps) => {
      mockSharedInputs.push(props);
      return react.createElement(native.View, { testID: 'shared-body-host' });
    },
  };
});

jest.mock('htmlparser2', () => ({
  ...jest.requireActual<typeof import('htmlparser2')>('htmlparser2'),
  parseDocument: jest.fn(() => {
    throw new Error('JSON renderer must not parse markup');
  }),
}));
jest.mock('../../../modules/zhihu-rich-text', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isRichTextNativeAvailable: () => mockNativeAvailable,
    RichTextNativeView: (props: RichTextNativeViewProps) => {
      const flow = JSON.parse(props.flowJson) as RichTextFlow;
      mockNativeViews.set(flow.id, props);
      return react.createElement(
        native.View,
        { testID: `json-native-flow-${flow.id}` },
        react.createElement(native.Text, null, flow.text),
      );
    },
  };
});
jest.mock('../components/ZhihuNativeContent', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<
    typeof import('../components/ZhihuNativeContent')
  >('../components/ZhihuNativeContent');
  return {
    ...actual,
    ZhihuNativeContent: (props: ZhihuNativeContentProps) => {
      mockNativeInputs.push(props);
      return react.createElement(actual.ZhihuNativeContent, props);
    },
  };
});
jest.mock('../../../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    text: '#222222',
    textSecondary: '#666666',
    link: '#123456',
    backgroundSecondary: '#eeeeee',
    border: '#cccccc',
    primary: '#246810',
    onPrimary: '#ffffff',
  }),
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({ fontSizeScale: 1, lineHeightScale: 1.5 }),
}));
jest.mock('react-native-svg', () => ({ SvgUri: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const resources: Readonly<Record<string, ZhihuImageResource>> = {
  'https://example.invalid/image.png': {
    mediaType: 'image',
    url: 'https://example.invalid/image.png',
    offlineUri: 'file:///synthetic/image.png',
    width: 80,
    height: 40,
  },
};

function content(text = '<script>合成文字</script>'): ZhihuStructuredContent {
  return {
    paging: JSON.stringify({
      is_end: true,
      is_start: true,
      next: '',
      previous: '',
      totals: 0,
    }),
    segments: [
      {
        id: 'paragraph',
        type: 'paragraph',
        paragraph: {
          pid: 'unverified-business-id',
          text,
          marks: [{ type: 'bold', start_index: 0, end_index: text.length }],
        },
      },
      {
        id: 'heading',
        type: 'heading',
        heading: { level: 2, text: '合成标题', marks: [] },
      },
      {
        id: 'list',
        type: 'list_node',
        list_node: {
          type: 'unordered',
          items: [
            {
              indent_level: 1,
              text: '甲[公式]乙',
              marks: [
                {
                  type: 'formula',
                  start_index: 1,
                  end_index: 5,
                  formula: {
                    content: 'x + y',
                    img_url: 'https://example.invalid/formula.png',
                    url: 'https://example.invalid/source-answer',
                    width: 60,
                    height: 20,
                  },
                },
              ],
            },
          ],
        },
      },
      {
        id: 'image',
        type: 'image',
        image: {
          description: '合成图片',
          height: 40,
          is_gif: false,
          layout: 'small',
          original_token: '',
          original_urls: [],
          status: 'normal',
          token: '',
          urls: ['https://example.invalid/image.png'],
          width: 80,
        },
      },
      { id: 'divider', type: 'hr' },
    ],
  };
}

function displayedImages() {
  return screen.root?.queryAll((node) => node.type === 'Image') ?? [];
}

async function layoutCurrentDocument(): Promise<void> {
  const container = screen
    .getAllByTestId('native-content-layout', { includeHiddenElements: true })
    .at(-1);
  if (!container) throw new Error('Missing native document');
  await fireEvent(container, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
  });
}

async function measureCurrentDocument(): Promise<void> {
  await layoutCurrentDocument();
  const body = screen
    .getAllByTestId('native-content-body', { includeHiddenElements: true })
    .at(-1);
  if (!body) throw new Error('Missing mounted native body');
  await fireEvent(body, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 120 } },
  });
  await act(() => {
    for (const view of mockNativeViews.values()) {
      const flow = JSON.parse(view.flowJson) as RichTextFlow;
      view.onHeightChange?.({
        flowId: flow.id,
        textVersion: flow.textVersion,
        layoutKey: view.layoutKey,
        height: 120,
      });
    }
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeAvailable = true;
  mockNativeViews.clear();
  mockNativeInputs.length = 0;
  mockSharedInputs.length = 0;
});

describe('isolated structured-content renderer', () => {
  it('uses the shared production host with complete source identities through preview, expansion and refresh', async () => {
    const first = parseZhihuStructuredContent(
      nextRenderSegLikeFixture.data[0].structured_content,
    );
    const duplicated = parseZhihuStructuredContent(
      nextRenderSegLikeFixture.data[1].structured_content,
    ).segments[0];
    if (duplicated.type !== 'paragraph')
      throw new Error('Expected captured source paragraph');
    const source: ZhihuStructuredContent = {
      ...first,
      segments: [
        ...first.segments.map((segment) =>
          segment.type === 'paragraph'
            ? {
                ...segment,
                paragraph: {
                  ...segment.paragraph,
                  // Decimal synthetic IDs exercise the same validator as real
                  // business IDs without retaining or requesting real targets.
                  marks: segment.paragraph.marks.map((mark) =>
                    mark.type === 'seg_like'
                      ? {
                          ...mark,
                          seg_like: {
                            ...mark.seg_like,
                            seg_ids: ['200', '201'],
                          },
                        }
                      : mark,
                  ),
                },
              }
            : segment,
        ),
        duplicated,
        { ...duplicated, id: `${duplicated.id}:hidden-duplicate` },
      ],
    };
    const original = JSON.stringify(source);
    const onRefresh = jest.fn();
    const host = await render(
      <StructuredRenderer
        content={source}
        documentId="answer:42"
        objectId="42"
        renderer="shared"
        onRefresh={onRefresh}
        selectable={false}
      />,
    );
    const preview = mockSharedInputs.at(-1);
    const document = preview?.document;
    if (!document) throw new Error('Expected shared source document');
    expect(preview).toMatchObject({
      objectId: '42',
      type: 'answer',
      onRefresh,
      selectable: false,
    });
    expect(preview?.renderer).toBeUndefined();
    expect(document.blocks).toHaveLength(3);
    expect(document.blocks[2]).not.toHaveProperty('paragraphId');
    expect(preview?.segmentInfos).toEqual(
      getStructuredContentSegmentInfos(source),
    );
    expect(preview?.segmentInfos).toHaveLength(1);
    const compiled = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 26,
    });
    const flow = compiled.parts.find((part) => part.type === 'flow');
    if (flow?.type !== 'flow') throw new Error('Expected captured source flow');
    expect(mapRichTextSelection(flow.flow, 0, 44)).toMatchObject({
      start: { paragraphId: 'synthetic-paragraph-001-001', offset: 0 },
      end: { paragraphId: 'synthetic-paragraph-001-001', offset: 44 },
    });
    const segment = [...walkZhihuDocument(document)].find(
      (node) => node.type === 'segment',
    );
    if (!segment) throw new Error('Expected complete source reaction');
    expect(
      resolveNativeAnswerSegment(
        {
          nodeId: segment.id,
          paragraphId: segment.paragraphId,
          start: 0,
          end: 44,
          text: flow.flow.text.slice(0, 44),
          segment,
        },
        {
          objectId: preview.objectId,
          type: preview.type,
          document,
          segmentInfos: preview.segmentInfos,
        },
      ),
    ).toMatchObject({ interaction: { seg_ids: ['200', '201'] } });

    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    const expanded = mockSharedInputs.at(-1);
    expect(expanded?.document?.blocks).toHaveLength(4);
    expect(expanded?.document?.blocks.slice(0, 3)).toEqual(document.blocks);
    expect(expanded?.document?.blocks[3]).not.toHaveProperty('paragraphId');
    expect(expanded?.segmentInfos).toEqual(preview?.segmentInfos);
    expanded?.onRefresh?.();
    expect(onRefresh).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    expect(mockSharedInputs.at(-1)?.document?.blocks).toEqual(document.blocks);
    await host.rerender(
      <StructuredRenderer
        content={source}
        documentId="answer:42"
        objectId="42"
        renderer="shared"
        onRefresh={onRefresh}
        selectable
      />,
    );
    expect(mockSharedInputs.at(-1)?.selectable).toBe(true);
    expect(JSON.stringify(source)).toBe(original);
    expect(mockNativeInputs).toHaveLength(0);
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it('uses actual segment slicing for preview, expansion and collapse without mutating JSON', async () => {
    const source = content();
    const before = JSON.stringify(source);
    await render(
      <StructuredRenderer
        content={source}
        documentId="case:preview"
        renderer="blocks"
        resources={resources}
      />,
    );
    expect(screen.getByText('<script>合成文字</script>')).toBeVisible();
    expect(screen.queryByLabelText('合成图片')).toBeNull();
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    expect(screen.getByLabelText('合成图片')).toBeVisible();
    expect(
      displayedImages().every(
        (image) =>
          image.props.source.uri === 'file:///synthetic/image.png' ||
          image.props.source.uri === 'https://example.invalid/formula.png',
      ),
    ).toBe(true);
    expect(screen.getByText('收起分段')).toBeVisible();
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    expect(screen.queryByLabelText('合成图片')).toBeNull();
    expect(JSON.stringify(source)).toBe(before);
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it('switches local backends while giving the native renderer a document rather than markup or business callbacks', async () => {
    const source = content();
    const host = await render(
      <StructuredRenderer
        content={source}
        documentId="case:backends"
        renderer="blocks"
        resources={resources}
      />,
    );
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    await host.rerender(
      <StructuredRenderer
        content={source}
        documentId="case:backends"
        renderer="native-v2"
        resources={resources}
      />,
    );
    expect(screen.getByTestId('structured-content-native')).toBeTruthy();
    expect(screen.getByText('收起分段')).toBeVisible();
    const input = mockNativeInputs.at(-1);
    expect(input?.content).toBe('');
    expect(input?.document?.blocks).toHaveLength(5);
    expect(input?.document?.id).toBe('case:backends');
    expect(input?.segmentInfos).toBeUndefined();
    expect(input?.onSegmentPress).toBeUndefined();
    expect(input?.onSelectionChange).toBeUndefined();
    expect(input?.document?.blocks[0]).toHaveProperty(
      'paragraphId',
      'unverified-business-id',
    );
    expect(input?.document?.blocks[1]).not.toHaveProperty('paragraphId');
    expect(input?.document?.blocks[2]).not.toHaveProperty('paragraphId');
    await measureCurrentDocument();
    expect(
      displayedImages().every(
        (image) =>
          image.props.source.uri === 'file:///synthetic/image.png' ||
          image.props.source.uri === 'https://example.invalid/formula.png',
      ),
    ).toBe(true);
    expect(
      [...mockNativeViews.values()].some((view) =>
        (JSON.parse(view.flowJson) as RichTextFlow).text.includes(
          '<script>合成文字</script>',
        ),
      ),
    ).toBe(true);
    expect(parseDocument).not.toHaveBeenCalled();
    await host.rerender(
      <StructuredRenderer
        content={source}
        documentId="case:backends"
        renderer="blocks"
        resources={resources}
      />,
    );
    expect(screen.getByTestId('structured-content-blocks')).toBeTruthy();
    expect(screen.getByLabelText('合成图片')).toBeVisible();
  });

  it('keeps expansion controlled when recycled and reports incomplete body paging', async () => {
    const onExpandedChange = jest.fn();
    const onLoadMore = jest.fn();
    const props = {
      content: content(),
      documentId: 'answer:one',
      renderer: 'blocks' as const,
      expanded: false,
      onExpandedChange,
      hasMore: true,
      onLoadMore,
      resources,
    };
    const host = await render(<StructuredRenderer {...props} />);
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.queryByLabelText('合成图片')).toBeNull();
    await host.rerender(<StructuredRenderer {...props} expanded />);
    expect(screen.getByLabelText('合成图片')).toBeVisible();
    await fireEvent.press(screen.getByText('加载更多正文'));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await host.rerender(
      <StructuredRenderer {...props} expanded showLoadMoreControl={false} />,
    );
    expect(screen.queryByText('加载更多正文')).toBeNull();
    await host.rerender(
      <StructuredRenderer
        {...props}
        expanded
        showLoadMoreControl={false}
        loadMoreError="正文续页请求失败"
      />,
    );
    await fireEvent.press(screen.getByText('重新加载正文'));
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    await host.rerender(
      <StructuredRenderer
        {...props}
        expanded
        hasMore={false}
        onLoadMore={undefined}
        loadMoreError="正文尚未完整，请进入详情继续阅读"
      />,
    );
    expect(screen.getByText('正文尚未完整，请进入详情继续阅读')).toBeVisible();
    expect(screen.queryByText('加载更多正文')).toBeNull();
    await host.rerender(
      <StructuredRenderer
        {...props}
        renderer="shared"
        hasMore={false}
        showLoadMoreControl={false}
        loadMoreError="正文续页请求失败"
      />,
    );
    await fireEvent.press(screen.getByText('重新加载正文'));
    expect(onLoadMore).toHaveBeenCalledTimes(3);
    await host.rerender(
      <StructuredRenderer {...props} documentId="answer:two" />,
    );
    expect(screen.queryByLabelText('合成图片')).toBeNull();
    expect(screen.queryByText('加载更多正文')).toBeNull();
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it('falls back to independent JSON blocks when the native module is missing', async () => {
    mockNativeAvailable = false;
    await render(
      <StructuredRenderer
        content={content()}
        documentId="case:fallback"
        renderer="native-v2"
        resources={resources}
      />,
    );
    expect(screen.getByTestId('structured-content-blocks')).toBeTruthy();
    expect(
      screen.getByText('当前客户端未包含原生文本模块，使用 JSON 分段展示'),
    ).toBeVisible();
    expect(screen.getByText('<script>合成文字</script>')).toBeVisible();
    expect(mockNativeViews.size).toBe(0);
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it('loads a validated formula image URL in both backends and shows source text if blocks loading fails', async () => {
    const source = content();
    const host = await render(
      <StructuredRenderer
        content={source}
        documentId="case:formula"
        renderer="blocks"
        resources={resources}
      />,
    );
    const formula = screen.getByLabelText('x + y');
    expect(formula.props.source).toEqual({
      uri: 'https://example.invalid/formula.png',
      cache: 'force-cache',
    });
    await fireEvent(formula, 'error');
    expect(screen.getByText('x + y')).toBeVisible();
    await host.rerender(
      <StructuredRenderer
        content={source}
        documentId="case:formula"
        renderer="native-v2"
        resources={resources}
      />,
    );
    await measureCurrentDocument();
    const attachments = [...mockNativeViews.values()].flatMap(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).attachments,
    );
    expect(attachments).toContainEqual(
      expect.objectContaining({
        kind: 'formula',
        latex: 'x + y',
        url: 'https://example.invalid/formula.png',
      }),
    );
    expect(JSON.stringify(attachments)).not.toContain('source-answer');
  });

  it('prefers an explicit local formula resource in both backends without changing remote document identity', async () => {
    const mapped: Readonly<Record<string, ZhihuImageResource>> = {
      ...resources,
      'https://example.invalid/formula.png': {
        mediaType: 'image',
        url: 'https://example.invalid/formula.png',
        offlineUri: 'file:///synthetic/formula.png',
        width: 60,
        height: 20,
      },
    };
    const host = await render(
      <StructuredRenderer
        content={content()}
        documentId="case:local-formula"
        renderer="blocks"
        resources={mapped}
      />,
    );
    expect(screen.getByLabelText('x + y').props.source).toEqual({
      uri: 'file:///synthetic/formula.png',
    });
    await host.rerender(
      <StructuredRenderer
        content={content()}
        documentId="case:local-formula"
        renderer="native-v2"
        resources={mapped}
      />,
    );
    await measureCurrentDocument();
    const attachments = [...mockNativeViews.values()].flatMap(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).attachments,
    );
    expect(attachments).toContainEqual(
      expect.objectContaining({
        url: 'file:///synthetic/formula.png',
        latex: 'x + y',
      }),
    );
    expect(JSON.stringify(mockNativeInputs.at(-1)?.document)).toContain(
      'https://example.invalid/formula.png',
    );
  });

  it('keeps formula source visible when the image URL is unsafe and never substitutes its answer URL', async () => {
    const source = content();
    const unsafe: ZhihuStructuredContent = {
      ...source,
      segments: source.segments.map((segment) =>
        segment.type !== 'list_node'
          ? segment
          : {
              ...segment,
              list_node: {
                ...segment.list_node,
                items: segment.list_node.items.map((item) => ({
                  ...item,
                  marks: item.marks.map((mark) =>
                    mark.type !== 'formula'
                      ? mark
                      : {
                          ...mark,
                          formula: {
                            ...mark.formula,
                            img_url: 'javascript:unsafe',
                          },
                        },
                  ),
                })),
              },
            },
      ),
    };
    const host = await render(
      <StructuredRenderer
        content={unsafe}
        documentId="case:unsafe-formula"
        renderer="blocks"
      />,
    );
    expect(screen.getByText('x + y')).toBeVisible();
    expect(displayedImages()).toHaveLength(0);
    await host.rerender(
      <StructuredRenderer
        content={unsafe}
        documentId="case:unsafe-formula"
        renderer="native-v2"
      />,
    );
    await measureCurrentDocument();
    const attachments = [...mockNativeViews.values()].flatMap(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).attachments,
    );
    expect(attachments).toContainEqual(
      expect.objectContaining({ kind: 'formula', latex: 'x + y' }),
    );
    expect(attachments.every((attachment) => !attachment.url)).toBe(true);
    expect(JSON.stringify(attachments)).not.toContain('source-answer');
  });

  it('revises native geometry when supplied JSON changes and drops the previous case on an ID change', async () => {
    const source = content('已测量的合成正文');
    const host = await render(
      <StructuredRenderer
        content={source}
        documentId="case:revision"
        renderer="native-v2"
        resources={resources}
      />,
    );
    await measureCurrentDocument();
    const before = [...mockNativeViews.values()][0];
    await host.rerender(
      <StructuredRenderer
        content={content('新的合成正文')}
        documentId="case:revision"
        renderer="native-v2"
        resources={resources}
      />,
    );
    await layoutCurrentDocument();
    const after = [...mockNativeViews.values()][0];
    expect(after.layoutKey).not.toBe(before.layoutKey);
    expect(
      screen.getByTestId('native-pending-document', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    await measureCurrentDocument();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    await host.rerender(
      <StructuredRenderer
        content={content('另一案例')}
        documentId="case:other"
        renderer="native-v2"
        resources={resources}
      />,
    );
    expect(screen.queryByText('新的合成正文')).toBeNull();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
  });

  it('measures expanded, appended and collapsed JSON independently and removes the previous native layer', async () => {
    const source = content();
    const host = await render(
      <StructuredRenderer
        content={source}
        documentId="case:pagination"
        renderer="native-v2"
        resources={resources}
      />,
    );
    await measureCurrentDocument();
    const preview = mockNativeInputs.at(-1)?.document;
    expect(preview?.blocks).toHaveLength(3);
    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    const expanded = mockNativeInputs.at(-1)?.document;
    expect(expanded).not.toBe(preview);
    expect(expanded?.blocks).toHaveLength(5);
    expect(expanded?.blocks.slice(0, 3).map((block) => block.id)).toEqual(
      preview?.blocks.map((block) => block.id),
    );
    expect(
      screen.getByTestId('native-pending-document', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    await measureCurrentDocument();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    expect(screen.getByLabelText('合成图片')).toBeVisible();

    const appended: ZhihuStructuredContent = {
      ...source,
      segments: [
        ...source.segments,
        {
          id: 'appended-paragraph',
          type: 'paragraph',
          paragraph: {
            pid: 'unverified-appended-id',
            text: '追加的合成段落',
            marks: [],
          },
        },
      ],
    };
    await host.rerender(
      <StructuredRenderer
        content={appended}
        documentId="case:pagination"
        renderer="native-v2"
        resources={resources}
      />,
    );
    const next = mockNativeInputs.at(-1)?.document;
    expect(next).not.toBe(expanded);
    expect(next?.blocks).toHaveLength(6);
    expect(next?.blocks.slice(0, 5).map((block) => block.id)).toEqual(
      expanded?.blocks.map((block) => block.id),
    );
    await measureCurrentDocument();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    expect(screen.getAllByLabelText('合成图片')).toHaveLength(1);
    expect(screen.getByText('追加的合成段落')).toBeVisible();

    await fireEvent.press(screen.getByTestId('structured-content-toggle'));
    const collapsed = mockNativeInputs.at(-1)?.document;
    expect(collapsed).not.toBe(next);
    expect(collapsed?.blocks.map((block) => block.id)).toEqual(
      preview?.blocks.map((block) => block.id),
    );
    await measureCurrentDocument();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    expect(screen.getAllByTestId('native-visible-document')).toHaveLength(1);
    expect(screen.queryByLabelText('合成图片')).toBeNull();
    expect(screen.queryByText('追加的合成段落')).toBeNull();
    expect(screen.getByText('展开全部分段')).toBeVisible();
    expect(source.segments).toHaveLength(5);
    expect(appended.segments).toHaveLength(6);
    expect(parseDocument).not.toHaveBeenCalled();
  });

  it.each([
    'blocks',
    'native-v2',
  ] as const)('keeps normal images full width and small images at source width (%s)', async (renderer) => {
    const source = content();
    const imageSegment = source.segments.find(
      (segment) => segment.type === 'image',
    );
    if (imageSegment?.type !== 'image')
      throw new Error('Missing synthetic image');
    const images: ZhihuStructuredContent = {
      paging: source.paging,
      segments: [
        {
          ...imageSegment,
          id: 'normal-image',
          image: {
            ...imageSegment.image,
            layout: 'normal',
            description: 'normal image',
          },
        },
        {
          ...imageSegment,
          id: 'small-image',
          image: {
            ...imageSegment.image,
            layout: 'small',
            description: 'small image',
          },
        },
      ],
    };
    await render(
      <StructuredRenderer
        content={images}
        documentId={`case:image-layout:${renderer}`}
        renderer={renderer}
        resources={resources}
      />,
    );
    if (renderer === 'native-v2') await measureCurrentDocument();
    const imagesOnScreen = displayedImages();
    expect(imagesOnScreen).toHaveLength(2);
    const normal = StyleSheet.flatten(imagesOnScreen[0].props.style);
    const small = StyleSheet.flatten(imagesOnScreen[1].props.style);
    expect(normal.width).toBeGreaterThan(small.width);
    expect(small.width).toBe(80);
    expect(small.height).toBe(40);
    if (renderer === 'native-v2') {
      await fireEvent(imagesOnScreen[1], 'load', {
        nativeEvent: { source: { width: 1024, height: 512 } },
      });
      expect(StyleSheet.flatten(displayedImages()[1].props.style).width).toBe(
        80,
      );
    }
  });
});
