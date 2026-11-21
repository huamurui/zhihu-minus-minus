import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Suspense, startTransition, useState } from 'react';
import {
  Dimensions,
  type LayoutChangeEvent,
  Platform,
  Text,
} from 'react-native';
import type {
  RichTextHeightEventData,
  RichTextNativeViewProps,
} from '../../../../modules/zhihu-rich-text';
import { ZhihuNativeContent } from '../components/ZhihuNativeContent';
import * as nativePreparation from '../nativePartPreparation';
import type { RichTextFlow } from '../richText';

let mockNativeAvailable = true;
let mockTextColor = '#234567';
let mockImageLoadingMode: 'auto' | 'manual' = 'auto';
const mockNativeViews = new Map<string, RichTextNativeViewProps>();
const mockNativeMounts = new Map<string, number>();
const mockNativeRenders = new Map<string, number>();
const mockNativeWidths: number[] = [];
const mockSvgProps: { uri: string; color?: string; fill?: string }[] = [];

jest.mock('../../../../modules/zhihu-rich-text', () => {
  const react = jest.requireActual<typeof import('react')>('react');
  const native =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    isRichTextNativeAvailable: () => mockNativeAvailable,
    RichTextNativeView: (props: RichTextNativeViewProps) => {
      const flow = JSON.parse(props.flowJson) as RichTextFlow;
      mockNativeViews.set(flow.id, props);
      mockNativeRenders.set(flow.id, (mockNativeRenders.get(flow.id) ?? 0) + 1);
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
  useSettingsStore: () => ({
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    imageLoadingMode: mockImageLoadingMode,
  }),
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
  mockImageLoadingMode = 'auto';
  mockTextColor = '#234567';
  mockNativeViews.clear();
  mockNativeMounts.clear();
  mockNativeRenders.clear();
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

  it('keeps a measured blank between images below body line height while protecting normal text', async () => {
    await render(
      <ZhihuNativeContent
        content='<img src="https://example.com/before.png"><p><br></p><img src="https://example.com/after.png"><p>普通文字</p>'
        objectId="compact-blank-native-height"
        type="answer"
        renderFallback={() => null}
      />,
    );
    await containerLayout(320);
    const views = currentViews();
    expect(views).toHaveLength(2);
    const [blankView, textView] = views;
    const blankFlow = JSON.parse(blankView.flowJson) as RichTextFlow;
    expect(blankFlow.paragraphs).toHaveLength(1);
    expect(blankFlow.paragraphs[0].emptyLine).toBe(true);
    const { lineHeight } = JSON.parse(textView.configJson) as {
      lineHeight: number;
    };
    const measuredHeight = lineHeight / 2;

    await heightEvent(blankView, { height: measuredHeight });
    await heightEvent(textView, { height: measuredHeight });

    expect(screen.getByTestId(`native-flow-${flowId(blankView)}`)).toHaveStyle({
      height: measuredHeight,
    });
    expect(screen.getByTestId(`native-flow-${flowId(textView)}`)).toHaveStyle({
      height: lineHeight,
    });
    expect(screen.getByText('普通文字')).toBeVisible();
  });

  it.each(['<hr/>', ''])(
    'reports content layout for a document without top-level text: %s',
    async (content) => {
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
    },
  );

  it.each([undefined, 0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'waits for a valid container width instead of mounting a guessed layout (hint %s)',
    async (initialContentWidth) => {
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
    },
  );

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
    expect(
      screen.getByTestId(`native-flow-${flowId(view)}`, {
        includeHiddenElements: true,
      }),
    ).not.toBeVisible();

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

  it('finishes the committed body while a replacement text layout is suspended', async () => {
    const frames: FrameRequestCallback[] = [];
    const request = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
    const cancel = jest
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation(() => {});
    const never = new Promise<void>(() => {});
    const pendingRender = jest.fn();
    const initial = {
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
    };
    const pending = {
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
    };
    let changeFont: (() => void) | undefined;
    function PendingLayout({ active }: { active: boolean }) {
      if (active) {
        pendingRender();
        throw never;
      }
      return null;
    }
    function Reader() {
      const [larger, setLarger] = useState(false);
      changeFont = () => setLarger(true);
      return (
        <Suspense fallback={<Text>等待字号变化</Text>}>
          <ZhihuNativeContent
            type="answer"
            objectId="concurrent-progressive-layout"
            content={`<p>可读正文</p>${'<hr>'.repeat(16)}<img src="https://example.test/end.jpg" alt="最后一张配图" />`}
            fontSizeScale={larger ? 1.25 : 1}
            progressive
            renderFallback={() => null}
            {...(larger ? pending : initial)}
          />
          <PendingLayout active={larger} />
        </Suspense>
      );
    }
    try {
      await render(<Reader />);
      await containerLayout(320);
      await heightEvent(currentViews()[0]);
      expect(initial.onFirstContentLayout).toHaveBeenCalledTimes(1);
      expect(frames).toHaveLength(1);
      expect(screen.queryByLabelText('最后一张配图')).toBeNull();

      await act(() => startTransition(() => changeFont?.()));
      expect(pendingRender).toHaveBeenCalled();
      expect(screen.getByText('可读正文')).toBeVisible();
      for (let count = 0; count < 20 && frames.length; count++) {
        const frame = frames.shift();
        await act(() => frame?.(performance.now()));
      }
      expect(screen.getByLabelText('最后一张配图')).toBeVisible();
      expect(initial.onLayoutReady).not.toHaveBeenCalled();
      await fireEvent(screen.getByTestId('native-content-end'), 'layout', {
        nativeEvent: { layout: { width: 320 } },
      });
      expect(initial.onLayoutReady).toHaveBeenCalledTimes(1);
      expect(initial.onFirstContentLayout).toHaveBeenCalledTimes(1);
      expect(pending.onLayoutReady).not.toHaveBeenCalled();
      expect(pending.onFirstContentLayout).not.toHaveBeenCalled();
    } finally {
      request.mockRestore();
      cancel.mockRestore();
    }
  });

  it.each(['android', 'ios'] as const)(
    'checks the reader interaction before a queued tail frame runs on %s',
    async (os) => {
      const platform = jest.replaceProperty(Platform, 'OS', os);
      let queued: FrameRequestCallback | undefined;
      const request = jest
        .spyOn(globalThis, 'requestAnimationFrame')
        .mockImplementation((cb) => {
          queued = cb;
          return 1;
        });
      let touched = false;
      const advance = () =>
        act(() => {
          if (!queued) throw new Error('expected a tail frame');
          const frame = queued;
          queued = undefined;
          // Exercise the part limit independently of test runner load.
          const clock = jest.spyOn(performance, 'now').mockReturnValue(0);
          try {
            frame(0);
          } finally {
            clock.mockRestore();
          }
        });
      try {
        await render(
          <ZhihuNativeContent
            content={'<p>段落</p><hr>'.repeat(30)}
            type="answer"
            objectId="tail-interaction"
            progressive
            canExpandProgressiveTail={() => !touched}
            renderFallback={() => null}
          />,
        );
        await containerLayout(320);
        const first = currentViews();
        for (const view of first) await heightEvent(view);
        await advance();
        const beforeTouch = currentViews().length;
        // Each pair contributes one independent text flow and one divider.
        expect(beforeTouch - first.length).toBe(os === 'android' ? 6 : 3);
        touched = true;
        await advance();
        expect(currentViews().length - beforeTouch).toBe(3);
      } finally {
        request.mockRestore();
        platform.restore();
      }
    },
  );

  it('reveals a long document before its tail, then resumes without remounting the visible text', async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let serial = 0;
    const request = jest
      .spyOn(globalThis, 'requestAnimationFrame')
      .mockImplementation((cb) => {
        frames.set(++serial, cb);
        return serial;
      });
    const cancel = jest
      .spyOn(globalThis, 'cancelAnimationFrame')
      .mockImplementation((id) => {
        if (typeof id === 'number') frames.delete(id);
      });
    const paragraphs = Array.from(
      { length: 16 },
      (_, index) => `正文第${index + 1}段`,
    );
    const props = {
      content: paragraphs.map((text) => `<p>${text}</p>`).join('<hr>'),
      type: 'answer' as const,
      objectId: 'progressive-mixed-content',
      progressive: true,
      renderFallback: () => null,
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
    };
    try {
      const renderer = await render(
        <ZhihuNativeContent {...props} pauseProgressiveTail />,
      );
      await containerLayout(320);
      const first = currentViews();
      expect(first.length).toBeGreaterThan(0);
      expect(first.length).toBeLessThan(paragraphs.length);
      expect(screen.queryByText(paragraphs[paragraphs.length - 1])).toBeNull();
      for (const view of first) await heightEvent(view);
      expect(screen.getByText(paragraphs[0])).toBeVisible();
      expect(props.onFirstContentLayout).toHaveBeenCalledTimes(1);
      expect(props.onLayoutReady).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);

      await renderer.rerender(<ZhihuNativeContent {...props} />);
      const firstRenders = mockNativeRenders.get(flowId(first[0]));
      for (
        let count = 0;
        count < paragraphs.length * 2 && frames.size;
        count++
      ) {
        const [id, frame] = [...frames][0];
        frames.delete(id);
        await act(() => frame(performance.now()));
      }
      expect(currentViews()).toHaveLength(paragraphs.length);
      expect(screen.getByText(paragraphs[paragraphs.length - 1])).toBeVisible();
      expect(mockNativeMounts.get(flowId(first[0]))).toBe(1);
      expect(mockNativeRenders.get(flowId(first[0]))).toBe(firstRenders);
      await fireEvent(screen.getByTestId('native-content-end'), 'layout', {
        nativeEvent: { layout: { width: 320 } },
      });
      expect(props.onLayoutReady).not.toHaveBeenCalled();
      for (const view of currentViews().slice(first.length))
        await heightEvent(view);
      expect(props.onLayoutReady).toHaveBeenCalledTimes(1);
      expect(props.onFirstContentLayout).toHaveBeenCalledTimes(1);
    } finally {
      request.mockRestore();
      cancel.mockRestore();
    }
  });

  it.each([
    ['text', `<p>${'首屏'.repeat(2000)}</p><hr>`],
    [
      'image',
      '<img src="https://example.com/cover.jpg" width="300" height="1000">',
    ],
  ])(
    'does not wait for a later flow after a first part fills the viewport (%s)',
    async (kind, opening) => {
      const onFirstContentLayout = jest.fn();
      const onLayoutReady = jest.fn();
      const content =
        opening +
        Array.from({ length: 12 }, (_, i) => `<p>尾部${i}</p><hr>`).join('');
      await render(
        <ZhihuNativeContent
          objectId="viewport-first"
          type="answer"
          content={content}
          progressive
          pauseProgressiveTail
          renderFallback={() => null}
          onLayoutReady={onLayoutReady}
          onFirstContentLayout={onFirstContentLayout}
        />,
      );
      await containerLayout(320);
      expect(
        screen.queryByText('尾部0', { includeHiddenElements: true }),
      ).toBeNull();
      if (kind === 'text') await heightEvent(currentViews()[0]);
      else await bodyLayout();
      expect(onFirstContentLayout).toHaveBeenCalledTimes(1);
      expect(onLayoutReady).not.toHaveBeenCalled();
    },
  );

  it('keeps the tapped image loaded and defers the next image when the tail mounts', async () => {
    mockImageLoadingMode = 'manual';
    const props = {
      content: [
        '<img src="https://example.com/first.jpg" alt="首图">',
        '<hr>'.repeat(12),
        '<img src="https://example.com/last.jpg" alt="尾图">',
      ].join(''),
      type: 'answer' as const,
      objectId: 'manual-progressive-images',
      progressive: true,
      renderFallback: () => null,
    };
    const renderer = await render(
      <ZhihuNativeContent {...props} pauseProgressiveTail />,
    );
    await containerLayout(320);
    await bodyLayout();
    await fireEvent.press(screen.getByLabelText('点击加载图片'));
    expect(screen.getByLabelText('首图')).toBeVisible();
    expect(screen.queryByLabelText('点击加载图片')).toBeNull();

    await renderer.rerender(<ZhihuNativeContent {...props} />);
    const deferredTail = await screen.findByLabelText('点击加载图片');
    expect(screen.getByLabelText('首图')).toBeVisible();
    expect(screen.queryByLabelText('尾图')).toBeNull();
    await fireEvent.press(deferredTail);
    expect(screen.getByLabelText('尾图')).toBeVisible();
  });

  it('preserves one selectable flow and a single layout gate for long continuous prose', async () => {
    const onFirstContentLayout = jest.fn();
    const onLayoutReady = jest.fn();
    const text = '混合文本🙂';
    const count = 128;
    await render(
      <ZhihuNativeContent
        objectId="progressive-prose"
        type="answer"
        content={`<p>${text}</p>`.repeat(count)}
        progressive
        pauseProgressiveTail
        renderFallback={() => null}
        onFirstContentLayout={onFirstContentLayout}
        onLayoutReady={onLayoutReady}
      />,
    );
    await containerLayout(320);
    const [native] = currentViews();
    expect(currentViews()).toHaveLength(1);
    expect(native.selectable).toBe(true);
    expect((JSON.parse(native.flowJson) as RichTextFlow).text).toBe(
      Array(count).fill(text).join('\n'),
    );
    await heightEvent(native);
    expect(onFirstContentLayout).toHaveBeenCalledTimes(1);
    expect(onLayoutReady).toHaveBeenCalledTimes(1);
  });

  it('retains its compiler and measured prefix when only the viewport height changes', async () => {
    const prepare = jest.spyOn(nativePreparation, 'prepareNativeParts');
    const original = Dimensions.get('window');
    const content = Array.from(
      { length: 14 },
      (_, i) => `<p>段${i}</p><hr>`,
    ).join('');
    const first = jest.fn();
    try {
      await render(
        <ZhihuNativeContent
          content={content}
          type="answer"
          objectId="height-only"
          progressive
          pauseProgressiveTail
          onFirstContentLayout={first}
          renderFallback={() => null}
        />,
      );
      await containerLayout(320);
      for (const view of currentViews()) await heightEvent(view);
      const compilations = prepare.mock.calls.length;
      await act(() =>
        Dimensions.set({
          window: { ...original, height: original.height + 40 },
        }),
      );
      expect(prepare).toHaveBeenCalledTimes(compilations);
      expect(screen.getByText('段0')).toBeVisible();
      expect(first).toHaveBeenCalledTimes(1);
    } finally {
      await act(() => Dimensions.set({ window: original }));
      prepare.mockRestore();
    }
  });

  it('keeps later text views mounted when a new early mark renumbers divider nodes', async () => {
    const paragraphs = Array.from({ length: 24 }, (_, i) => `段落${i}`);
    const props = {
      content: [
        '<hr>',
        ...paragraphs.map((text, i) => `<p data-pid="p${i}">${text}</p><hr>`),
      ].join(''),
      type: 'answer' as const,
      objectId: 'marked-groups',
      progressive: true,
      renderFallback: () => null,
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    for (const view of currentViews()) await heightEvent(view);
    await screen.findByText(paragraphs[paragraphs.length - 1]);
    const flowIds = currentViews().map(flowId);
    expect(flowIds).toHaveLength(paragraphs.length);
    await renderer.rerender(
      <ZhihuNativeContent
        {...props}
        segmentInfos={[
          {
            pid: 'p0',
            text: paragraphs[0],
            marks: [
              {
                start_index: 0,
                end_index: 1,
                seg_info: {
                  seg_ids: ['1'],
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
    expect(screen.getByText(paragraphs[paragraphs.length - 1])).toBeVisible();
    for (const id of flowIds) expect(mockNativeMounts.get(id)).toBe(1);
  });

  it('keeps a partially revealed document while a newer response prepares', async () => {
    const paragraphs = Array.from(
      { length: 16 },
      (_, index) => `旧正文第${index + 1}段`,
    );
    const props = {
      content: paragraphs.map((text) => `<p>${text}</p>`).join('<hr>'),
      type: 'answer' as const,
      objectId: 'progressive-refetch',
      progressive: true,
      pauseProgressiveTail: true,
      renderFallback: () => null,
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
    };
    const renderer = await render(<ZhihuNativeContent {...props} />);
    await containerLayout(320);
    for (const view of currentViews()) await heightEvent(view);
    expect(props.onLayoutReady).not.toHaveBeenCalled();

    await renderer.rerender(
      <ZhihuNativeContent {...props} content="<p>新正文</p>" />,
    );
    expect(screen.getByText(paragraphs[0])).toBeVisible();
    expect(
      screen.getByTestId('native-visible-document').props.pointerEvents,
    ).toBe('none');
    await containerLayout(320);
    expect(props.onFirstContentLayout).toHaveBeenCalledTimes(1);
    const replacement = currentViews().find(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).text === '新正文',
    );
    if (!replacement) throw new Error('Replacement flow is missing');
    await heightEvent(replacement);
    expect(screen.getByText('新正文')).toBeVisible();
    expect(screen.queryByText(paragraphs[0])).toBeNull();
    expect(props.onFirstContentLayout).toHaveBeenCalledTimes(2);
    expect(props.onLayoutReady).toHaveBeenCalledTimes(1);
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

  it.each(['<hr>', ''])(
    'waits for the mounted body layout for block-only or empty content (%s)',
    async (content) => {
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
    },
  );

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
    expect(
      screen.getByText('回答乙正文', { includeHiddenElements: true }),
    ).not.toBeVisible();
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
  it('waits for native heights inside captions, display formulas and table cells at the confirmed width', async () => {
    const first = jest.fn();
    const full = jest.fn();
    const content = [
      '<figure><img src="https://example.com/illustration.jpg"><figcaption>图片说明</figcaption></figure>',
      '<img eeimg="2" src="https://example.com/formula.svg" alt="a+b">',
      '<table><caption>表说明</caption><tbody><tr><td><blockquote><p>表中说明</p></blockquote></td></tr></tbody></table>',
    ].join('');
    await render(
      <ZhihuNativeContent
        content={content}
        type="article"
        objectId="nested-first"
        onFirstContentLayout={first}
        onLayoutReady={full}
        renderFallback={() => null}
      />,
    );
    await containerLayout(320);
    const old = currentViews();
    expect(
      old
        .map((view) => (JSON.parse(view.flowJson) as RichTextFlow).text)
        .sort(),
    ).toEqual(['图片说明', '\uFFFC', '表说明', '表中说明'].sort());
    await bodyLayout(320);
    expect(first).not.toHaveBeenCalled();
    expect(full).not.toHaveBeenCalled();
    await containerLayout(420);
    await bodyLayout(420);
    for (const view of old) await heightEvent(view);
    expect(first).not.toHaveBeenCalled();
    const updated = currentViews();
    expect(updated.map((view) => view.contentWidth)).not.toEqual(
      old.map((view) => view.contentWidth),
    );
    const cell = updated.find(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).text === '表中说明',
    );
    if (!cell) throw new Error('Missing nested cell');
    expect(cell.contentWidth).toBeLessThan(420);
    for (const view of updated.filter((view) => view !== cell))
      await heightEvent(view, { height: 137 });
    expect(first).not.toHaveBeenCalled();
    await heightEvent(cell, { height: 139 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(full).toHaveBeenCalledTimes(1);
    const visible = screen.getByTestId(`native-flow-${flowId(cell)}`);
    expect(visible).toBeVisible();
    expect(visible).toHaveStyle({ width: cell.contentWidth, height: 139 });
  });

  it('remeasures captions when the container resizes within the same integer text width', async () => {
    const full = jest.fn();
    await render(
      <ZhihuNativeContent
        content='<p>开头</p><figure><img src="https://example.com/cover.jpg"><figcaption>图注</figcaption></figure>'
        objectId="nested-integer-width"
        type="article"
        options={{ integerMeasure: true }}
        renderFallback={() => null}
        onLayoutReady={full}
      />,
    );
    await containerLayout(320);
    const [top, caption] = currentViews();
    await heightEvent(top);
    await heightEvent(caption);
    expect(full).toHaveBeenCalledTimes(1);

    await containerLayout(321);
    const [resizedTop, resizedCaption] = currentViews();
    expect(resizedTop.layoutKey).toBe(top.layoutKey);
    expect(resizedCaption.contentWidth).toBe(321);
    await heightEvent(caption);
    expect(full).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('native-content-placeholder')).toBeVisible();

    await heightEvent(resizedCaption);
    expect(full).toHaveBeenCalledTimes(2);
    expect(screen.getByText('图注')).toBeVisible();
  });

  it('keeps the first prefix readable while a native formula in the last batch is still measuring', async () => {
    const props = {
      content: [
        `<p>${'首段'.repeat(3200)}</p>`,
        '<hr>',
        '<img eeimg="2" src="https://example.com/last.svg" alt="x+y">',
      ].join(''),
      type: 'article' as const,
      objectId: 'nested-tail',
      progressive: true,
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
      renderFallback: () => null,
    };
    const renderer = await render(
      <ZhihuNativeContent {...props} pauseProgressiveTail />,
    );
    await containerLayout(320);
    expect(currentViews()).toHaveLength(1);
    await heightEvent(currentViews()[0]);
    expect(props.onFirstContentLayout).toHaveBeenCalledTimes(1);
    await renderer.rerender(<ZhihuNativeContent {...props} />);
    const marker = await screen.findByTestId('native-content-end');
    await fireEvent(marker, 'layout', {
      nativeEvent: { layout: { width: 320 } },
    });
    expect(currentViews()).toHaveLength(2);
    expect(props.onLayoutReady).not.toHaveBeenCalled();
    await heightEvent(currentViews()[1], { height: 111 });
    expect(props.onLayoutReady).toHaveBeenCalledTimes(1);
    expect(props.onFirstContentLayout).toHaveBeenCalledTimes(1);
  });

  it('ignores superseded nested heights after the top-level flow of a new document has measured', async () => {
    const callbacks = {
      onFirstContentLayout: jest.fn(),
      onLayoutReady: jest.fn(),
    };
    const content = (label: string) =>
      `<p>开头</p><figure><img src="https://example.com/cover.jpg"><figcaption>${label}</figcaption></figure>`;
    const renderer = await render(
      <ZhihuNativeContent
        type="article"
        objectId="nested-source"
        content={content('旧图注')}
        renderFallback={() => null}
        {...callbacks}
      />,
    );
    await containerLayout(320);
    const oldCaption = currentViews().find(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).text === '旧图注',
    );
    if (!oldCaption) throw new Error('Missing old caption');
    await renderer.rerender(
      <ZhihuNativeContent
        type="article"
        objectId="nested-source"
        content={content('新图注')}
        renderFallback={() => null}
        {...callbacks}
      />,
    );
    await containerLayout(320);
    await bodyLayout(320);
    const current = currentViews();
    const caption = current.find(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).text === '新图注',
    );
    const top = current.find(
      (view) => (JSON.parse(view.flowJson) as RichTextFlow).text === '开头',
    );
    if (!caption || !top) throw new Error('Missing current flows');
    await heightEvent(top);
    await heightEvent(oldCaption, { height: 500 });
    expect(callbacks.onFirstContentLayout).not.toHaveBeenCalled();
    expect(callbacks.onLayoutReady).not.toHaveBeenCalled();
    await heightEvent(caption, { height: 140 });
    expect(screen.getByText('新图注')).toBeVisible();
    expect(screen.getByTestId(`native-flow-${flowId(caption)}`)).toHaveStyle({
      height: 140,
    });
    expect(callbacks.onFirstContentLayout).toHaveBeenCalledTimes(1);
    expect(callbacks.onLayoutReady).toHaveBeenCalledTimes(1);
  });
});
