import vm from 'node:vm';
import { act, render } from '@testing-library/react-native';
import { isTag } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import type { WebViewProps } from 'react-native-webview';
import ZhihuDOMContent, {
  type ZhihuDOMContentProps,
} from '../components/ZhihuDOMContent';

let mockWebViewProps: WebViewProps;
let mockRemoveImageWatermark = true;
const mockInjectJavaScript = jest.fn<void, [string]>();
jest.mock('react-native-webview', () => {
  const { forwardRef, useImperativeHandle } =
    jest.requireActual<typeof import('react')>('react');
  return {
    WebView: forwardRef<
      { injectJavaScript: (script: string) => void },
      WebViewProps
    >((props, ref) => {
      mockWebViewProps = props;
      useImperativeHandle(ref, () => ({
        injectJavaScript: mockInjectJavaScript,
      }));
      return null;
    }),
  };
});
jest.mock('../../../components/Themed', () => ({
  useRuntimeThemeColors: () => ({
    ...require('../../../constants/designTokens').colors.light,
    text: '#102030',
    link: '#203040',
    onPrimary: '#ffffff',
  }),
}));
jest.mock('../../../store/useSettingsStore', () => ({
  useSettingsStore: () => ({
    fontSizeScale: 1,
    lineHeightScale: 1.5,
    removeImageWatermark: mockRemoveImageWatermark,
  }),
}));

beforeEach(() => {
  mockInjectJavaScript.mockClear();
  mockRemoveImageWatermark = true;
});

async function renderPage(overrides: Partial<ZhihuDOMContentProps> = {}) {
  const onLinkPress = jest.fn();
  const onImagePress = jest.fn();
  const props: ZhihuDOMContentProps = {
    htmlContent: '<p data-pid="one">正文</p>',
    linkCardInfoStr: '{"title":"</script><script>throw 1</script>"}',
    colorScheme: 'light',
    onLinkPress,
    onImagePress,
    onSegmentPress: jest.fn(),
    ...overrides,
  };
  const view = await render(<ZhihuDOMContent {...props} />);
  const source = mockWebViewProps.source;
  if (!source || !('html' in source)) throw new Error('Expected inline HTML');
  return { html: source.html, onLinkPress, onImagePress, view, props };
}

function inlineScript(html: string): string {
  const scripts = parseDocument(html)
    .children.flatMap((node) => (isTag(node) ? node.children : []))
    .flatMap((node) => (isTag(node) ? node.children : []))
    .filter((node) => isTag(node) && node.name === 'script');
  const script = scripts.at(-1);
  if (!script || !isTag(script)) throw new Error('Expected inline script');
  return script.children
    .map((node) => ('data' in node ? node.data : ''))
    .join('');
}

function bridgeMessage(html: string, message: Record<string, unknown>) {
  const identity = /const documentIdentity = (\d+);/.exec(inlineScript(html));
  if (!identity) throw new Error('Expected document identity');
  return JSON.stringify({ documentIdentity: Number(identity[1]), ...message });
}

test.each([
  undefined,
  () => {
    throw new Error('Invalid formula');
  },
])(
  'initializes height reporting and interaction handlers when KaTeX is unavailable or fails',
  async (renderMathInElement) => {
    const { html } = await renderPage();
    const postMessage = jest.fn();
    const timers: (() => void)[] = [];
    let resolveFonts: () => void = () => {};
    const fontsReady = new Promise<void>((resolve) => {
      resolveFonts = resolve;
    });
    const container = {
      innerHTML: '',
      children: [],
      scrollHeight: 240,
      getBoundingClientRect: () => ({ height: container.scrollHeight }),
      querySelectorAll: () => [],
      addEventListener: jest.fn(),
    };
    const document = {
      fonts: { ready: fontsReady },
      getElementById: () => container,
      addEventListener: jest.fn(),
      body: { scrollHeight: 800, offsetHeight: 800 },
      documentElement: { scrollHeight: 800, offsetHeight: 800, style: {} },
    };
    const window = {
      ReactNativeWebView: { postMessage },
      addEventListener: jest.fn(),
      onload: undefined as (() => void) | undefined,
    };
    vm.runInNewContext(inlineScript(html), {
      document,
      window,
      renderMathInElement,
      setTimeout: (callback: () => void) => timers.push(callback),
    });
    expect(container.innerHTML).toContain('正文');
    expect(container.addEventListener).toHaveBeenCalledWith(
      'click',
      expect.any(Function),
    );
    for (const timer of timers) timer();
    expect(postMessage).toHaveBeenCalledWith(
      bridgeMessage(html, { type: 'height', height: 240 }),
    );
    expect(postMessage).toHaveBeenCalledTimes(1);
    container.scrollHeight = 300;
    resolveFonts();
    await fontsReady;
    expect(postMessage).toHaveBeenLastCalledWith(
      bridgeMessage(html, { type: 'height', height: 300 }),
    );
    container.scrollHeight = 120;
    window.onload?.();
    expect(postMessage).toHaveBeenLastCalledWith(
      bridgeMessage(html, { type: 'height', height: 120 }),
    );
  },
);

test.each([
  [
    true,
    'v2-11111111111111111111111111111111',
    'v2-11111111111111111111111111111111',
  ],
  [
    false,
    'v2-11111111111111111111111111111111',
    'v2-00000000000000000000000000000000',
  ],
  [true, 'invalid-token', 'v2-00000000000000000000000000000000'],
])(
  'WebView image rewriting respects the preference and validates token',
  async (enabled, token, expected) => {
    mockRemoveImageWatermark = enabled;
    const { html } = await renderPage();
    const attrs: Record<string, string> = {
      src: 'https://pic1.zhimg.com/v2-00000000000000000000000000000000_720w.jpg',
      'data-original-token': token,
    };
    const image = {
      getAttribute: (name: string) => attrs[name] ?? null,
      setAttribute: (name: string, value: string) => {
        attrs[name] = value;
      },
      style: {},
    };
    const container = {
      innerHTML: '',
      children: [],
      scrollHeight: 1,
      getBoundingClientRect: () => ({ height: 1 }),
      querySelectorAll: (selector: string) =>
        selector === 'img' ? [image] : [],
      addEventListener: jest.fn(),
    };
    vm.runInNewContext(inlineScript(html), {
      document: {
        getElementById: () => container,
        addEventListener: jest.fn(),
        documentElement: { style: {} },
      },
      window: {
        ReactNativeWebView: { postMessage: jest.fn() },
        addEventListener: jest.fn(),
      },
      setTimeout: jest.fn(),
    });
    expect(attrs.src).toBe(`https://pic1.zhimg.com/${expected}_720w.jpg`);
  },
);

test('keeps the document stable on height updates and rejects messages from replaced content', async () => {
  const onReady = jest.fn();
  const { html, view, props, onLinkPress, onImagePress } = await renderPage({
    onReady,
  });
  const firstSource = mockWebViewProps.source;
  const oldCallback = mockWebViewProps.onMessage;
  type MessageEvent = Parameters<NonNullable<WebViewProps['onMessage']>>[0];
  const event = (data: string) => ({ nativeEvent: { data } }) as MessageEvent;
  await act(() => {
    mockWebViewProps.onMessage?.(
      event(bridgeMessage(html, { type: 'height', height: 240 })),
    );
  });
  expect(mockWebViewProps.source).toBe(firstSource);
  expect(onReady).toHaveBeenCalledTimes(1);

  await view.rerender(<ZhihuDOMContent {...props} htmlContent="新正文" />);
  const replacement = mockWebViewProps.source;
  if (!replacement || !('html' in replacement))
    throw new Error('Expected replacement document');
  await act(() => {
    for (const message of [
      { type: 'height', height: 600 },
      { type: 'link', href: 'https://example.com/stale' },
      { type: 'image', src: 'https://example.com/stale.png' },
    ]) {
      const staleEvent = event(bridgeMessage(html, message));
      oldCallback?.(staleEvent);
      mockWebViewProps.onMessage?.(staleEvent);
    }
  });
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(onLinkPress).not.toHaveBeenCalled();
  expect(onImagePress).not.toHaveBeenCalled();
  await act(() => {
    mockWebViewProps.onMessage?.(
      event(bridgeMessage(replacement.html, { type: 'height', height: 120 })),
    );
  });
  expect(onReady).toHaveBeenCalledTimes(2);
  expect(mockWebViewProps.source).toBe(replacement);
});

test('preserves mixed pin content safely in a single document with outer scrolling', async () => {
  const { html } = await renderPage({
    contentArray: [
      { type: 'text', own_text: '<p>第一段</p><script>throw 1</script>' },
      {
        type: 'image',
        url: 'https://example.com/image.png',
        width: 640,
        height: 480,
      },
      {
        type: 'link_card',
        url: 'https://example.com/card',
        data_draft_title: '卡片<img src=x onerror="throw 1">',
        data_draft_cover: 'javascript:throw 1',
      },
    ],
  });
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(inlineScript(html), {
    document: {
      getElementById: () => container,
      addEventListener: jest.fn(),
    },
    window: { addEventListener: jest.fn() },
    setTimeout: jest.fn(),
  });
  const content = parseDocument(container.innerHTML);
  const elements = content.children.filter(isTag);
  expect(elements.map((element) => element.name)).toEqual(['div', 'img', 'a']);
  expect(elements[1].attribs).toMatchObject({
    src: 'https://example.com/image.png',
    'data-rawwidth': '640',
    'data-rawheight': '480',
  });
  expect(elements[2].attribs['data-draft-cover']).toBeUndefined();
  expect(elements[2].children).toHaveLength(1);
  expect(container.innerHTML).not.toContain('<script');
  expect(mockWebViewProps.scrollEnabled).toBe(false);
  expect(mockWebViewProps.showsVerticalScrollIndicator).toBe(false);
  expect(mockWebViewProps.showsHorizontalScrollIndicator).toBe(false);
});

test('starts with selection disabled and reapplies it after the document loads', async () => {
  const { html } = await renderPage({ selectable: false });
  const removeAllRanges = jest.fn();
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  const document: {
    documentElement?: { style: Record<string, string> };
    getElementById: () => typeof container;
    addEventListener: typeof jest.fn;
  } = {
    getElementById: () => container,
    addEventListener: jest.fn(),
  };
  const window = {
    getSelection: () => ({ removeAllRanges }),
    addEventListener: jest.fn(),
  };
  const context = { document, window, setTimeout: jest.fn() };
  vm.runInNewContext(
    mockWebViewProps.injectedJavaScriptBeforeContentLoaded ?? '',
    context,
  );
  expect(removeAllRanges).toHaveBeenCalledTimes(1);
  document.documentElement = { style: {} };
  vm.runInNewContext(inlineScript(html), context);
  expect(document.documentElement.style).toEqual({
    userSelect: 'none',
    webkitUserSelect: 'none',
  });
  vm.runInNewContext(mockWebViewProps.injectedJavaScript ?? '', context);
  expect(document.documentElement.style.userSelect).toBe('none');
  expect(removeAllRanges).toHaveBeenCalledTimes(2);

  // A platform can skip its before-load injection; the document still starts disabled.
  document.documentElement.style = {};
  vm.runInNewContext(inlineScript(html), {
    ...context,
    window: { addEventListener: jest.fn() },
  });
  expect(document.documentElement.style.userSelect).toBe('none');
});

test('toggles selection without reloading and rejects delayed events and scripts across disable/enable', async () => {
  const onTextSelected = jest.fn();
  const { html, view, props } = await renderPage({ onTextSelected });
  const source = mockWebViewProps.source;
  const originalCallback = mockWebViewProps.onMessage;
  const enabledScript = mockWebViewProps.injectedJavaScript ?? '';
  type MessageEvent = Parameters<NonNullable<WebViewProps['onMessage']>>[0];
  const info = {
    text: '正文',
    startParagraphId: 'one',
    endParagraphId: 'one',
    startOffset: 0,
    endOffset: 2,
  };
  const event = (selectionRevision: number) =>
    ({
      nativeEvent: {
        data: bridgeMessage(html, {
          type: 'selection',
          info,
          selectionRevision,
        }),
      },
    }) as MessageEvent;
  await act(() => originalCallback?.(event(0)));
  expect(onTextSelected).toHaveBeenLastCalledWith(info);
  const removeAllRanges = jest.fn();
  const document = { documentElement: { style: {} as Record<string, string> } };
  const window: {
    getSelection: () => { removeAllRanges: typeof removeAllRanges };
    __zhihuTextSelectable?: boolean;
  } = { getSelection: () => ({ removeAllRanges }) };
  const context = { document, window };
  vm.runInNewContext(enabledScript, context);
  mockInjectJavaScript.mockClear();
  mockRemoveImageWatermark = true;

  await view.rerender(<ZhihuDOMContent {...props} selectable={false} />);
  expect(mockWebViewProps.source).toBe(source);
  expect(onTextSelected).toHaveBeenLastCalledWith(null);
  expect(mockInjectJavaScript).toHaveBeenCalledTimes(1);
  const disabledScript = mockInjectJavaScript.mock.calls[0][0];
  vm.runInNewContext(disabledScript, context);
  expect(document.documentElement.style.userSelect).toBe('none');
  expect(removeAllRanges).toHaveBeenCalledTimes(1);
  await act(() => {
    originalCallback?.(event(0));
    mockWebViewProps.onMessage?.(event(1));
  });
  expect(onTextSelected).toHaveBeenCalledTimes(2);

  await view.rerender(<ZhihuDOMContent {...props} selectable />);
  expect(mockWebViewProps.source).toBe(source);
  expect(mockInjectJavaScript).toHaveBeenCalledTimes(2);
  vm.runInNewContext(mockInjectJavaScript.mock.calls[1][0], context);
  expect(document.documentElement.style.userSelect).toBe('text');
  vm.runInNewContext(disabledScript, context);
  vm.runInNewContext(enabledScript, context);
  expect(window.__zhihuTextSelectable).toBe(true);
  expect(document.documentElement.style.userSelect).toBe('text');
  await act(() => {
    originalCallback?.(event(0));
    mockWebViewProps.onMessage?.(event(1));
  });
  expect(onTextSelected).toHaveBeenCalledTimes(2);
  await act(() => mockWebViewProps.onMessage?.(event(2)));
  expect(onTextSelected).toHaveBeenCalledTimes(3);
  expect(onTextSelected).toHaveBeenLastCalledWith(info);
});

test('builds untrusted footnote labels and definitions as text nodes', async () => {
  const { html } = await renderPage();
  interface Element {
    style: Record<string, string>;
    textContent: string;
    innerText: string;
    id: string;
    children: Element[];
    appendChild: (child: Element) => void;
    replaceChildren: (...children: Element[]) => void;
    getAttribute?: (name: string) => string | null;
  }
  const createElement = (): Element => {
    const children: Element[] = [];
    const element = {
      style: {},
      textContent: '',
      innerText: '',
      id: '',
      children,
      appendChild: (child: Element) => children.push(child),
      replaceChildren: (...next: Element[]) =>
        children.splice(0, children.length, ...next),
    };
    Object.defineProperty(element, 'innerHTML', {
      set: () => {
        throw new Error('Footnote metadata must remain text');
      },
    });
    return element;
  };
  const rawText = '<img src=x onerror="throw 1">';
  const rawLabel = '1"><img src=x onerror="throw 1">';
  const footnote = createElement();
  footnote.getAttribute = (name) =>
    name === 'data-text' ? rawText : name === 'data-numero' ? rawLabel : null;
  const createTextNode = jest.fn((text: string) => {
    const node = createElement();
    node.textContent = text;
    return node;
  });
  const container = {
    innerHTML: '',
    querySelectorAll: (selector: string) =>
      selector === 'sup[data-text]' ? [footnote] : [],
    appendChild: jest.fn(),
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(inlineScript(html), {
    document: {
      getElementById: () => container,
      createElement,
      createTextNode,
      addEventListener: jest.fn(),
    },
    window: { addEventListener: jest.fn() },
    setTimeout: jest.fn(),
  });
  expect(createTextNode).toHaveBeenCalledWith(` ${rawText}`);
  expect(footnote.children[0].textContent).toBe(`[${rawLabel}]`);
  expect(container.appendChild).toHaveBeenCalledTimes(1);
});

test('maps element selection boundaries through a DOM range and clears selections outside source paragraphs', async () => {
  const { html } = await renderPage();
  const postMessage = jest.fn();
  const timers: (() => void)[] = [];
  const listeners = new Map<string, () => void>();
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  const paragraph = {
    nodeType: 1,
    getAttribute: (name: string) => (name === 'data-pid' ? 'one' : null),
    parentElement: container,
  };
  const textNode = { nodeType: 3, parentElement: paragraph };
  let endContainer: object = textNode;
  const prefixes: { target: object; offset: number }[] = [];
  const document = {
    getElementById: () => container,
    addEventListener: (type: string, callback: () => void) =>
      listeners.set(type, callback),
    createRange: () => ({
      selectNodeContents: jest.fn(),
      setEnd: (target: object, offset: number) =>
        prefixes.push({ target, offset }),
      toString: () => (prefixes.at(-1)?.target === paragraph ? '甲' : '甲乙丙'),
    }),
  };
  vm.runInNewContext(inlineScript(html), {
    document,
    window: {
      __zhihuSelectionDocumentIdentity: JSON.parse(bridgeMessage(html, {}))
        .documentIdentity,
      __zhihuTextSelectable: true,
      __zhihuSelectionRevision: 0,
      ReactNativeWebView: { postMessage },
      addEventListener: jest.fn(),
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        toString: () => '乙丙',
        getRangeAt: () => ({
          startContainer: paragraph,
          startOffset: 1,
          endContainer,
          endOffset: 2,
        }),
      }),
    },
    setTimeout: (callback: () => void) => timers.push(callback),
    clearTimeout: jest.fn(),
  });
  listeners.get('selectionchange')?.();
  timers.pop()?.();
  expect(prefixes).toEqual([
    { target: paragraph, offset: 1 },
    { target: textNode, offset: 2 },
  ]);
  expect(JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string)).toEqual({
    documentIdentity: JSON.parse(bridgeMessage(html, {})).documentIdentity,
    selectionRevision: 0,
    type: 'selection',
    info: {
      text: '乙丙',
      startParagraphId: 'one',
      endParagraphId: 'one',
      startOffset: 1,
      endOffset: 3,
    },
  });
  endContainer = container;
  listeners.get('selectionchange')?.();
  timers.pop()?.();
  expect(postMessage).toHaveBeenLastCalledWith(
    bridgeMessage(html, {
      type: 'selection',
      info: null,
      selectionRevision: 0,
    }),
  );
});

test('prevents content navigation from replacing the rendering document', async () => {
  const { onLinkPress } = await renderPage();
  const navigate = (url: string) =>
    mockWebViewProps.onShouldStartLoadWithRequest?.({
      url,
      loading: false,
      title: '',
      canGoBack: false,
      canGoForward: false,
      lockIdentifier: 1,
      navigationType: 'click',
      isTopFrame: true,
    });
  expect(navigate('about:blank')).toBe(true);
  expect(navigate('https://example.com/')).toBe(false);
  expect(onLinkPress).toHaveBeenCalledWith('https://example.com/');
  onLinkPress.mockClear();
  expect(navigate('javascript:throw 1')).toBe(false);
  expect(onLinkPress).not.toHaveBeenCalled();
});

test('pin video segments open the native player through the existing link bridge', async () => {
  const { html, onLinkPress } = await renderPage({
    contentArray: [
      {
        type: 'video',
        video_id: '101',
        url: 'https://www.zhihu.com/zvideo/202',
        thumbnail: 'https://example.com/pin-cover.png',
        title: '想法视频',
      },
      { type: 'video', url: 'https://example.com/synthetic.mp4' },
      { type: 'video', url: 'https://example.com/page' },
    ],
  });
  const script = inlineScript(html);
  expect(script).toContain('zhihu--:///video/101?source=lens');
  expect(script).toContain('zhihu--:///video/direct?source=direct');
  expect(script).toContain('视频不可用');
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: jest.fn(),
  };
  vm.runInNewContext(script, {
    document: {
      getElementById: () => container,
      addEventListener: jest.fn(),
    },
    window: { addEventListener: jest.fn() },
    setTimeout: jest.fn(),
  });
  const firstVideo = parseDocument(container.innerHTML).children.find(isTag);
  if (!firstVideo) throw new Error('Expected video cover');
  const videoRoute =
    'zhihu--:///video/101?source=lens&title=%E6%83%B3%E6%B3%95%E8%A7%86%E9%A2%91';
  expect(firstVideo.attribs.href).toBe(videoRoute);
  const cover = firstVideo.children.find(
    (node) => isTag(node) && node.name === 'img',
  );
  expect(cover && isTag(cover) && cover.attribs).toEqual({
    class: 'zhihu-video-cover',
    src: 'https://example.com/pin-cover.png',
    alt: '想法视频',
  });
  const event = {
    nativeEvent: {
      data: bridgeMessage(html, {
        type: 'link',
        href: videoRoute,
      }),
    },
  } as Parameters<NonNullable<WebViewProps['onMessage']>>[0];
  await act(() => mockWebViewProps.onMessage?.(event));
  expect(onLinkPress).toHaveBeenCalledWith(videoRoute);
});

test('clicking the video cover or play label opens native playback and long presses skip image actions', async () => {
  const { html } = await renderPage({
    htmlContent:
      '<video data-lens-id="101" poster="https://example.com/cover.png"></video>',
  });
  const postMessage = jest.fn();
  type TouchEvent = {
    target: unknown;
    touches: { identifier: number; clientX: number; clientY: number }[];
  };
  type ClickEvent = {
    target: unknown;
    preventDefault: () => void;
    stopPropagation: () => void;
  };
  const listeners = new Map<string, (event: TouchEvent & ClickEvent) => void>();
  const container = {
    innerHTML: '',
    querySelectorAll: () => [],
    addEventListener: (
      name: string,
      callback: (event: TouchEvent & ClickEvent) => void,
    ) => listeners.set(name, callback),
  };
  const setTimeout = jest.fn();
  vm.runInNewContext(inlineScript(html), {
    document: {
      getElementById: () => container,
      addEventListener: jest.fn(),
    },
    window: {
      ReactNativeWebView: { postMessage },
      addEventListener: jest.fn(),
    },
    setTimeout,
    clearTimeout: jest.fn(),
  });
  setTimeout.mockClear();
  const video = {
    tagName: 'A',
    classList: { contains: (name: string) => name === 'zhihu-video' },
    getAttribute: (name: string) =>
      name === 'href' ? 'zhihu--:///video/101?source=lens' : null,
    parentElement: container,
  };
  for (const tagName of ['IMG', 'SPAN']) {
    const target = {
      tagName,
      classList: { contains: () => false },
      getAttribute: () => 'https://example.com/cover.png',
      parentElement: video,
    };
    const event = {
      target,
      touches: [{ identifier: 1, clientX: 20, clientY: 20 }],
      preventDefault: jest.fn(),
      stopPropagation: jest.fn(),
    };
    listeners.get('touchstart')?.(event);
    expect(setTimeout).not.toHaveBeenCalled();
    listeners.get('click')?.(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(postMessage).toHaveBeenLastCalledWith(
      bridgeMessage(html, {
        type: 'link',
        href: 'zhihu--:///video/101?source=lens',
      }),
    );
  }
  expect(postMessage).toHaveBeenCalledTimes(2);
});

test('formula scripts and fonts are inline with no CDN dependency', async () => {
  const { html } = await renderPage();
  expect(html).not.toContain('cdn.jsdelivr.net');
  const parsed = parseDocument(html);
  const head = parsed.children
    .flatMap((node) => (isTag(node) ? node.children : []))
    .flatMap((node) =>
      isTag(node) && node.name === 'head' ? node.children : [],
    );
  const scripts = head.filter((node) => isTag(node) && node.name === 'script');
  expect(scripts).toHaveLength(2);
  for (const script of scripts)
    if (isTag(script)) expect(script.attribs.src).toBeUndefined();
  expect(html).toContain('data:font/woff2;base64,');
});
