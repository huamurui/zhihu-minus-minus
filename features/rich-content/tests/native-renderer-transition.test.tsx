import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { type LayoutChangeEvent, Text } from 'react-native';
import type {
  RichTextHeightEventData,
  RichTextNativeViewProps,
} from '../../../modules/zhihu-rich-text';
import { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import type { RichTextFlow } from '../richText';

let mockNativeAvailable = true;
let mockTextColor = '#234567';
const mockNativeViews = new Map<string, RichTextNativeViewProps>();
const mockNativeMounts = new Map<string, number>();
const mockNativeWidths: number[] = [];
const mockSvgProps: { uri: string; color?: string; fill?: string }[] = [];

jest.mock('../../../modules/zhihu-rich-text', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isRichTextNativeAvailable: () => mockNativeAvailable,
    RichTextNativeView: (props: RichTextNativeViewProps) => {
      const flow = JSON.parse(props.flowJson) as RichTextFlow;
      mockNativeViews.set(flow.id, props);
      mockNativeWidths.push(props.contentWidth);
      react.useEffect(() => {
        mockNativeMounts.set(flow.id, (mockNativeMounts.get(flow.id) ?? 0) + 1);
      }, [flow.id]);
      return react.createElement(
        native.View,
        { testID: `native-flow-${flow.id}`, style: props.style },
        react.createElement(native.Text, null, flow.text),
      );
    },
  };
});
jest.mock('../../../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    text: mockTextColor,
    textSecondary: mockTextColor,
    link: mockTextColor,
    backgroundSecondary: mockTextColor,
    border: mockTextColor,
  }),
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({ fontSizeScale: 1, lineHeightScale: 1.5 }),
}));
jest.mock('react-native-svg', () => ({
  SvgUri: (props: { uri: string; color?: string; fill?: string }) => {
    mockSvgProps.push(props);
    return null;
  },
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

function currentViews(): RichTextNativeViewProps[] {
  return [...mockNativeViews.values()];
}

function flowId(props: RichTextNativeViewProps): string {
  return (JSON.parse(props.flowJson) as RichTextFlow).id;
}

async function heightEvent(
  props: RichTextNativeViewProps,
  changes: Partial<RichTextHeightEventData> = {},
): Promise<void> {
  const flow = JSON.parse(props.flowJson) as RichTextFlow;
  await act(() => {
    props.onHeightChange?.({
      flowId: flow.id,
      textVersion: flow.textVersion,
      layoutKey: props.layoutKey,
      height: 120,
      ...changes,
    });
  });
}

async function containerLayout(width: number): Promise<void> {
  const container = screen
    .getAllByTestId('native-content-layout', { includeHiddenElements: true })
    .at(-1);
  if (!container) throw new Error('Missing renderer container');
  await fireEvent(container, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

async function bodyLayout(width = 320): Promise<void> {
  const body = screen
    .getAllByTestId('native-content-body', { includeHiddenElements: true })
    .at(-1);
  if (!body) throw new Error('Missing mounted native body');
  await fireEvent(body, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width, height: 0 } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockNativeAvailable = true;
  mockTextColor = '#234567';
  mockNativeViews.clear();
  mockNativeMounts.clear();
  mockNativeWidths.length = 0;
  mockSvgProps.length = 0;
});

describe('Native V2 renderer staging transitions', () => {
  it('distinguishes width confirmation from native layout even for one character', async () => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>短</p>"
        objectId="short-loading-phases"
        type="answer"
        renderFallback={() => null}
        renderPlaceholder={(phase) => <Text>{phase}</Text>}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByText('container-layout')).toBeVisible();
    expect(currentViews()).toHaveLength(0);

    await containerLayout(320);
    expect(screen.getByText('text-layout')).toBeVisible();
    const view = currentViews()[0];
    await heightEvent(view, { layoutKey: 'stale-layout' });
    expect(screen.getByText('text-layout')).toBeVisible();
    expect(onLayoutReady).not.toHaveBeenCalled();

    await heightEvent(view);
    expect(screen.queryByText('text-layout')).toBeNull();
    expect(screen.getByText('短')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('reports width confirmation when a hinted native layout finishes first', async () => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>先排版后确认容器</p>"
        objectId="hint-loading-phases"
        type="answer"
        initialContentWidth={320}
        renderFallback={() => null}
        renderPlaceholder={(phase) => <Text>{phase}</Text>}
        onLayoutReady={onLayoutReady}
      />,
    );
    await heightEvent(currentViews()[0]);
    expect(screen.getByText('container-layout')).toBeVisible();
    expect(onLayoutReady).not.toHaveBeenCalled();

    await containerLayout(320);
    expect(screen.queryByText('container-layout')).toBeNull();
    expect(screen.queryByText('text-layout')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it.each([
    '<hr/>',
    '',
  ])('reports content layout for a document without top-level text: %s', async (content) => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content={content}
        objectId="block-loading-phases"
        type="answer"
        renderFallback={() => null}
        renderPlaceholder={(phase) => <Text>{phase}</Text>}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByText('container-layout')).toBeVisible();
    await containerLayout(320);
    expect(screen.getByText('content-layout')).toBeVisible();
    expect(currentViews()).toHaveLength(0);
    await bodyLayout(288);
    expect(screen.getByText('content-layout')).toBeVisible();
    expect(onLayoutReady).not.toHaveBeenCalled();

    await bodyLayout(320);
    expect(screen.queryByText('content-layout')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it.each([
    undefined,
    0,
    -10,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ])('waits for a valid container width instead of mounting a guessed layout (hint %s)', async (initialContentWidth) => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>等待实际宽度的正文</p>"
        objectId="measured-width"
        type="answer"
        initialContentWidth={initialContentWidth}
        renderFallback={() => null}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(currentViews()).toHaveLength(0);
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    for (const width of [0, -10, Number.NaN, Number.POSITIVE_INFINITY])
      await containerLayout(width);
    expect(currentViews()).toHaveLength(0);
    expect(onLayoutReady).not.toHaveBeenCalled();

    await containerLayout(288);
    expect(currentViews()).toHaveLength(1);
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await heightEvent(currentViews()[0]);
    expect(screen.getByText('等待实际宽度的正文')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect([...new Set(mockNativeWidths)]).toEqual([288]);
  });

  it('corrects an outdated host width and rejects its old height event', async () => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>容器宽度已变化</p>"
        objectId="corrected-host-width"
        type="answer"
        initialContentWidth={320}
        renderFallback={() => null}
        onLayoutReady={onLayoutReady}
      />,
    );
    const initial = currentViews()[0];
    expect(initial.contentWidth).toBe(320);
    await containerLayout(288);
    await heightEvent(initial);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    expect(currentViews()[0].contentWidth).toBe(288);
    await heightEvent(currentViews()[0]);
    expect(screen.getByText('容器宽度已变化')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps the video cover while opening its native playback route', async () => {
    const onLinkPress = jest.fn();
    const onImagePress = jest.fn();
    const onImageLongPress = jest.fn();
    await render(
      <ZhihuNativeContent
        content='<a class="video-box" data-lens-id="101" href="https://www.zhihu.com/zvideo/202"><span><img data-actualsrc="https://example.com/poster.png"></span></a>'
        objectId="native-video-playback"
        type="answer"
        renderFallback={() => null}
        onLinkPress={onLinkPress}
        onImagePress={onImagePress}
        onImageLongPress={onImageLongPress}
      />,
    );
    await containerLayout(320);
    await bodyLayout();
    const cover = screen.getByTestId('rich-content-video-cover');
    expect(cover.props.source).toEqual({
      uri: 'https://example.com/poster.png',
      cache: 'force-cache',
    });
    await fireEvent.press(cover);
    expect(onLinkPress).toHaveBeenCalledWith(
      'zhihu--:///video/101?source=lens',
    );
    expect(onImagePress).not.toHaveBeenCalled();
    await fireEvent(cover, 'longPress');
    expect(onImageLongPress).not.toHaveBeenCalled();
    expect(screen.queryByText('打开视频页面')).toBeNull();
  });

  it('keeps source mapping in JS while sending only layout fields to native', async () => {
    const onSelectionChange = jest.fn();
    await render(
      <ZhihuNativeContent
        content='<p data-pid="source-one">甲<strong>乙丙</strong></p>'
        objectId="staging-source-map"
        type="answer"
        renderFallback={() => null}
        onSelectionChange={onSelectionChange}
      />,
    );
    await containerLayout(320);
    const view = currentViews()[0];
    const serialized = JSON.parse(view.flowJson) as RichTextFlow;
    expect(serialized.sourceMap).toBeUndefined();
    await containerLayout(view.contentWidth);
    await heightEvent(currentViews()[0]);
    const ready = currentViews()[0];
    await act(() => {
      ready.onSelectionChange?.({
        flowId: serialized.id,
        textVersion: serialized.textVersion,
        start: 1,
        end: 3,
      });
    });
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        mapping: expect.objectContaining({
          text: '乙丙',
          start: expect.objectContaining({
            paragraphId: 'source-one',
            offset: 1,
          }),
          end: expect.objectContaining({
            paragraphId: 'source-one',
            offset: 3,
          }),
        }),
      }),
      expect.objectContaining({ sourceMap: expect.any(Array) }),
      expect.any(Object),
    );
  });

  it('keeps short inline formulas inside the surrounding list sentence', async () => {
    await render(
      <ZhihuNativeContent
        content='<ul><li data-pid="formula-list">单位矩阵 <img eeimg="1" src="https://www.zhihu.com/equation?tex=I" alt="I"/> 仍在句内。</li><li>普通段落</li></ul>'
        objectId="staging-inline-formula"
        type="answer"
        renderFallback={() => <Text>经典排版回退</Text>}
      />,
    );
    await containerLayout(320);
    expect(currentViews()).toHaveLength(1);
    const flow = JSON.parse(currentViews()[0].flowJson) as RichTextFlow;
    expect(flow.text).toBe('• 单位矩阵 \uFFFC 仍在句内。\n• 普通段落');
    expect(flow.paragraphs).toHaveLength(2);
    expect(flow.attachments).toHaveLength(1);
    expect(flow.attachments[0].copyText).toBe('I');
  });

  it('passes the current text color to inline and display formula attachments while keeping ordinary SVG images untinted', async () => {
    const inlineUri = 'https://www.zhihu.com/equation?tex=x';
    const displayUri = 'https://www.zhihu.com/equation?tex=y';
    const imageUri = 'https://example.com/original.svg';
    const props = {
      content: `<p>行内<img eeimg="1" src="${inlineUri}" alt="x"/>公式。</p><img eeimg="2" src="${displayUri}" alt="y"/><img src="${imageUri}" width="240" height="120"/>`,
      objectId: 'staging-formula-theme',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    expect(currentViews()).toHaveLength(2);
    expect(
      currentViews().map((view) => JSON.parse(view.configJson).textColor),
    ).toEqual(['#234567', '#234567']);

    mockTextColor = '#f4f5f6';
    // The theme stub has no subscription; force the memoized host to read it.
    await renderer.rerender(<ZhihuNativeContent {...props} options={{}} />);
    const views = currentViews();
    expect(views.map((view) => JSON.parse(view.configJson).textColor)).toEqual([
      '#f4f5f6',
      '#f4f5f6',
    ]);
    const attachments = views.flatMap(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).attachments,
    );
    expect(attachments.map(({ kind, url }) => ({ kind, url }))).toEqual([
      { kind: 'formula', url: inlineUri },
      { kind: 'formula', url: displayUri },
    ]);
    expect(mockSvgProps.length).toBeGreaterThan(0);
    expect(mockSvgProps.every((svg) => svg.uri === imageUri)).toBe(true);
    expect(mockSvgProps.every((svg) => !svg.color && !svg.fill)).toBe(true);
  });

  it('uses its local skeleton without invoking the fallback while waiting or ready', async () => {
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content='<p data-pid="p-one">原生正文</p>'
        objectId="staging-default"
        type="answer"
        initialContentWidth={320}
        renderFallback={renderFallback}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(currentViews()).toHaveLength(1);
    const view = currentViews()[0];
    expect(screen.getByTestId(`native-flow-${flowId(view)}`)).not.toBeVisible();

    // Native estimates alone cannot reveal content before its host width exists.
    await heightEvent(view);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await containerLayout(view.contentWidth);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(view)}`)).toBeVisible();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect([...new Set(mockNativeWidths)]).toEqual([320]);
    await heightEvent(view);
    await containerLayout(view.contentWidth);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps a custom excerpt until every flow matches the current width and configuration', async () => {
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const renderPlaceholder = jest.fn(() => <Text>保留已读摘要</Text>);
    const onLayoutReady = jest.fn();
    const props = {
      content:
        '<p data-pid="p-one">第一段原生正文</p><hr><p data-pid="p-two">第二段原生正文</p>',
      objectId: 'staging-excerpt',
      type: 'answer' as const,
      initialContentWidth: 280,
      renderFallback,
      renderPlaceholder,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(currentViews()).toHaveLength(2);
    const firstWidthViews = currentViews();

    await containerLayout(320);
    const widthViews = currentViews();
    expect(widthViews.every((view) => view.contentWidth === 320)).toBe(true);
    await heightEvent(widthViews[0]);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(widthViews[1], {
      layoutKey: firstWidthViews[1].layoutKey,
    });
    expect(screen.getByText('保留已读摘要')).toBeVisible();

    await renderer.rerender(
      <ZhihuNativeContent {...props} options={{ justify: true }} />,
    );
    const configuredViews = currentViews();
    await containerLayout(320);
    expect(configuredViews[0].configJson).not.toBe(widthViews[0].configJson);
    await heightEvent(configuredViews[1]);
    // A previously measured flow at the old config must be measured again.
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(widthViews[0]);
    await heightEvent(configuredViews[0], {
      layoutKey: widthViews[0].layoutKey,
    });
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    await heightEvent(configuredViews[0]);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('保留已读摘要')).toBeNull();
    for (const view of configuredViews)
      expect(screen.getByTestId(`native-flow-${flowId(view)}`)).toBeVisible();

    await containerLayout(340);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    for (const view of configuredViews) await heightEvent(view);
    expect(screen.getByText('保留已读摘要')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    for (const view of currentViews()) await heightEvent(view);
    expect(screen.queryByText('保留已读摘要')).toBeNull();
    expect(renderFallback).not.toHaveBeenCalled();
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
  });

  it.each([
    '<hr>',
    '',
  ])('waits for the mounted body layout for block-only or empty content (%s)', async (content) => {
    const onLayoutReady = jest.fn();
    const props = {
      content,
      objectId: 'staging-blocks',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    expect(currentViews()).toHaveLength(0);
    expect(onLayoutReady).not.toHaveBeenCalled();
    await containerLayout(320);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await bodyLayout();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    const staleLayout = screen.getByTestId('native-content-layout').props
      .onLayout as (event: LayoutChangeEvent) => void;
    await containerLayout(320);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await renderer.rerender(
      <ZhihuNativeContent {...props} content="<hr><hr>" />,
    );
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await act(() =>
      staleLayout({
        nativeEvent: { layout: { x: 0, y: 0, width: 320, height: 0 } },
      } as LayoutChangeEvent),
    );
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await containerLayout(320);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await bodyLayout();
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
  });

  it('reuses its measured host width for a replacement without guessing or remounting the prepared flow', async () => {
    const props = {
      content: '<p>当前正文</p>',
      objectId: 'reused-host-width',
      type: 'answer' as const,
      renderFallback: () => null,
    };
    const host = await render(<ZhihuNativeContent {...props} />);
    await fireEvent(screen.getByTestId('native-content-host'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 288, height: 120 } },
    });
    await containerLayout(288);
    await heightEvent(currentViews()[0]);
    await host.rerender(
      <ZhihuNativeContent {...props} content="<p>替换正文</p>" />,
    );
    const pending = currentViews()[0];
    expect((JSON.parse(pending.flowJson) as RichTextFlow).text).toBe(
      '替换正文',
    );
    expect(pending.contentWidth).toBe(288);
    expect(screen.getByText('当前正文')).toBeVisible();
    await heightEvent(pending);
    expect(screen.getByText('当前正文')).toBeVisible();
    await containerLayout(288);
    expect(screen.getByText('替换正文')).toBeVisible();
    expect(mockNativeMounts.get(flowId(pending))).toBe(2);
    expect([...new Set(mockNativeWidths)]).toEqual([288]);
  });

  it('rejects an old body width delivered to the latest layout handler', async () => {
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<hr>"
        objectId="block-width-race"
        type="answer"
        initialContentWidth={320}
        renderFallback={() => null}
        onLayoutReady={onLayoutReady}
      />,
    );
    await containerLayout(288);
    await bodyLayout(320);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await bodyLayout(288);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
  });

  it('keeps verified text mounted and visible when only reaction metadata changes', async () => {
    const onLayoutReady = jest.fn();
    const segmentInfo = {
      pid: 'p-one',
      text: '甲乙丙丁',
      marks: [
        {
          start_index: 0,
          end_index: 2,
          seg_info: {
            seg_ids: ['123'],
            is_like: false,
            like_count: 1,
            comment_count: 0,
          },
        },
      ],
    };
    const props = {
      content: '<p data-pid="p-one">甲乙丙丁</p>',
      objectId: 'staging-metadata',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
      segmentInfos: [segmentInfo],
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews()[0];
    await heightEvent(before);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(mockNativeMounts.get(flowId(before))).toBe(1);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        linkCardInfo={{}}
        segmentInfos={[
          {
            ...segmentInfo,
            marks: [
              {
                ...segmentInfo.marks[0],
                seg_info: {
                  ...segmentInfo.marks[0].seg_info,
                  is_like: true,
                  like_count: 2,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews()[0];
    expect(after.layoutKey).toBe(before.layoutKey);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(after)}`)).toBeVisible();
    expect(mockNativeMounts.get(flowId(after))).toBe(1);
    await heightEvent(before);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps the revealed body and verified height when a refresh adds a knowledge mark', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<p data-pid="p-one"><strong>甲乙丙丁</strong></p>',
      objectId: 'staging-new-mark',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews()[0];
    await heightEvent(before, { height: 345 });
    const verifiedStyle = currentViews()[0].style;
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        segmentInfos={[
          {
            pid: 'p-one',
            text: '甲乙丙丁',
            marks: [
              {
                start_index: 0,
                end_index: 2,
                seg_info: {
                  seg_ids: ['123'],
                  is_like: false,
                  like_count: 1,
                  comment_count: 0,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews()[0];
    expect(after.layoutKey).not.toBe(before.layoutKey);
    expect(after.style).toEqual(verifiedStyle);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.getByTestId(`native-flow-${flowId(after)}`)).toBeVisible();
    expect(mockNativeMounts.get(flowId(after))).toBe(1);
    await heightEvent(before, { height: 999 });
    expect(currentViews()[0].style).toEqual(after.style);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await heightEvent(after, { height: 350 });
    expect(currentViews()[0].style).toEqual({ width: 320, height: 350 });
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('keeps matching first-layout measurements while metadata updates another flow', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<p data-pid="p-one">甲乙</p><hr><p data-pid="p-two">丙丁</p>',
      objectId: 'staging-partial-metadata',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews();
    await heightEvent(before[0]);
    expect(onLayoutReady).not.toHaveBeenCalled();
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        segmentInfos={[
          {
            pid: 'p-two',
            text: '丙丁',
            marks: [
              {
                start_index: 0,
                end_index: 1,
                seg_info: {
                  seg_ids: ['456'],
                  is_like: false,
                  like_count: 1,
                  comment_count: 0,
                },
              },
            ],
          },
        ]}
      />,
    );
    const after = currentViews();
    expect(after[0].layoutKey).toBe(before[0].layoutKey);
    expect(after[1].layoutKey).not.toBe(before[1].layoutKey);
    await heightEvent(before[1]);
    expect(onLayoutReady).not.toHaveBeenCalled();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    await heightEvent(after[1]);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
  });

  it('retains the measured body until every replacement flow is ready, without remounting the prepared replacement', async () => {
    const onLayoutReady = jest.fn();
    const onSelectionChange = jest.fn();
    const props = {
      content: '<p>缓存第一段</p><hr><p>缓存第二段</p>',
      objectId: 'staging-refetch',
      type: 'answer' as const,
      renderFallback: () => <Text>经典排版回退</Text>,
      renderPlaceholder: () => <Text>首次加载占位</Text>,
      onLayoutReady,
      onSelectionChange,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews();
    for (const view of before) await heightEvent(view);
    expect(screen.getByText('缓存第一段')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);

    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        content="<p>网络第一段完整正文</p><hr><p>网络第二段完整正文</p>"
      />,
    );
    expect(screen.getByText('缓存第一段')).toBeVisible();
    expect(
      screen.queryByText('网络第一段完整正文', { includeHiddenElements: true }),
    ).toBeNull();
    await containerLayout(320);
    expect(
      screen.getByText('网络第一段完整正文', { includeHiddenElements: true }),
    ).not.toBeVisible();
    expect(
      screen.getByText('首次加载占位', { includeHiddenElements: true }),
    ).not.toBeVisible();
    expect(
      screen.getByTestId('native-visible-document').props.pointerEvents,
    ).toBe('none');
    const oldFlow = JSON.parse(before[0].flowJson) as RichTextFlow;
    await act(() => {
      before[0].onSelectionChange?.({
        flowId: oldFlow.id,
        textVersion: oldFlow.textVersion,
        start: 0,
        end: 2,
      });
    });
    expect(onSelectionChange).not.toHaveBeenCalled();

    await containerLayout(320);
    const pending = currentViews();
    await heightEvent(pending[0]);
    await heightEvent(before[1]);
    expect(screen.getByText('缓存第二段')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await heightEvent(pending[1]);
    expect(screen.queryByText('缓存第一段')).toBeNull();
    expect(screen.getByText('网络第一段完整正文')).toBeVisible();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    expect(screen.queryByText('首次加载占位')).toBeNull();
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
    expect(mockNativeMounts.get(flowId(pending[0]))).toBe(2);
  });

  it('ignores a superseded replacement while keeping the last measured body', async () => {
    const onLayoutReady = jest.fn();
    const props = {
      content: '<p>已读正文</p>',
      objectId: 'staging-refetch-race',
      type: 'answer' as const,
      renderFallback: () => null,
      onLayoutReady,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    await heightEvent(currentViews()[0]);
    await renderer.rerender(
      <ZhihuNativeContent {...props} content="<p>较早响应</p>" />,
    );
    await containerLayout(320);
    const superseded = currentViews()[0];
    await renderer.rerender(
      <ZhihuNativeContent {...props} content="<p>最新响应</p>" />,
    );
    await containerLayout(320);
    const latest = currentViews()[0];
    await heightEvent(superseded);
    expect(screen.getByText('已读正文')).toBeVisible();
    expect(
      screen.queryByText('较早响应', { includeHiddenElements: true }),
    ).toBeNull();
    expect(
      screen.getByText('最新响应', { includeHiddenElements: true }),
    ).not.toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
    await heightEvent(latest);
    expect(screen.queryByText('已读正文')).toBeNull();
    expect(screen.getByText('最新响应')).toBeVisible();
    expect(onLayoutReady).toHaveBeenCalledTimes(2);
  });

  it('does not carry a previous answer into a different document', async () => {
    const props = {
      content: '<p>回答甲正文</p>',
      objectId: 'staging-answer-a',
      type: 'answer' as const,
      renderFallback: () => null,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    await heightEvent(currentViews()[0]);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        objectId="staging-answer-b"
        content="<p>回答乙正文</p>"
      />,
    );
    expect(screen.queryByText('回答甲正文')).toBeNull();
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();
    expect(screen.queryByText('回答乙正文')).toBeNull();
    await containerLayout(320);
    expect(screen.getByText('回答乙正文')).not.toBeVisible();
  });

  it('keeps equivalent structured content visible when a fresh response creates a new array', async () => {
    const props = {
      content: '',
      contentArray: [{ type: 'text' as const, content: '同一份想法正文' }],
      objectId: 'staging-same-pin',
      type: 'pin' as const,
      renderFallback: () => null,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    const before = currentViews()[0];
    await heightEvent(before);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        contentArray={props.contentArray.map((part) => ({ ...part }))}
      />,
    );
    expect(screen.getByText('同一份想法正文')).toBeVisible();
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(screen.queryByTestId('native-pending-document')).toBeNull();
    expect(mockNativeMounts.get(flowId(before))).toBe(1);
  });

  it('uses the complete fallback only when the native module is unavailable', async () => {
    mockNativeAvailable = false;
    const renderFallback = jest.fn(() => <Text>经典排版回退</Text>);
    const renderPlaceholder = jest.fn(() => <Text>不应显示的摘要占位</Text>);
    const onLayoutReady = jest.fn();
    await render(
      <ZhihuNativeContent
        content="<p>正文</p>"
        objectId="staging-unavailable"
        type="answer"
        renderFallback={renderFallback}
        renderPlaceholder={renderPlaceholder}
        onLayoutReady={onLayoutReady}
      />,
    );
    expect(screen.getByText('经典排版回退')).toBeVisible();
    expect(renderFallback).toHaveBeenCalledTimes(1);
    expect(renderPlaceholder).not.toHaveBeenCalled();
    expect(screen.queryByTestId('native-content-placeholder')).toBeNull();
    expect(currentViews()).toHaveLength(0);
    expect(onLayoutReady).not.toHaveBeenCalled();
  });
});
