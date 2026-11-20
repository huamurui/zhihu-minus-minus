import vm from 'node:vm';
import { act, render } from '@testing-library/react-native';
import { isTag } from 'domhandler';
import { parseDocument } from 'htmlparser2';
import { JSDOM } from 'jsdom';
import type { WebViewProps } from 'react-native-webview';
import ZhihuDOMContent, {
  type ZhihuDOMContentProps,
} from '../components/ZhihuDOMContent';

let mockWebViewProps: WebViewProps;
let mockRemoveImageWatermark = true;
let mockImageLoadingMode: 'auto' | 'manual' = 'auto';
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
    imageLoadingMode: mockImageLoadingMode,
  }),
}));

beforeEach(() => {
  mockInjectJavaScript.mockClear();
  mockRemoveImageWatermark = true;
  mockImageLoadingMode = 'auto';
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

test('renders URL-only footnotes once and treats untrusted metadata as text', async () => {
  const { html } = await renderPage();
  interface Element {
    style: Record<string, string>;
    textContent: string;
    href?: string;
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
  const sourceUrl = 'https://example.org/source';
  const urlReferences = [createElement(), createElement()];
  for (const node of urlReferences) {
    node.getAttribute = (name) =>
      name === 'data-url' ? sourceUrl : name === 'data-numero' ? '2' : null;
  }
  const createTextNode = jest.fn((text: string) => {
    const node = createElement();
    node.textContent = text;
    return node;
  });
  const container = {
    innerHTML: '',
    querySelectorAll: (selector: string) =>
      selector === 'sup[data-numero], sup[data-text]'
        ? [footnote, ...urlReferences]
        : [],
    appendChild: jest.fn<void, [Element]>(),
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
  const [, , urlDefinition] = container.appendChild.mock.calls[0][0].children;
  expect(urlDefinition.children.at(-1)).toMatchObject({
    href: sourceUrl,
    textContent: sourceUrl,
  });
  expect(urlReferences.map((node) => node.children[0].href)).toEqual([
    `#${urlDefinition.id}`,
    `#${urlDefinition.id}`,
  ]);
  expect(urlReferences[0].id).not.toBe(urlReferences[1].id);
});

function selectionRuntime(
  html: string,
  renderMathInElement?: (container: Element) => void,
  beforeLoad?: (document: Document) => void,
) {
  const dom = new JSDOM('<div id="content"></div>', {
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const { document } = window;
  const postMessage = jest.fn();
  let lastTimer = () => {};
  Object.assign(window, {
    __zhihuSelectionDocumentIdentity: JSON.parse(bridgeMessage(html, {}))
      .documentIdentity,
    __zhihuTextSelectable: true,
    __zhihuSelectionRevision: 0,
    ReactNativeWebView: { postMessage },
    renderMathInElement,
    setTimeout: (fn: () => void) => {
      lastTimer = fn;
      return 1;
    },
    clearTimeout: () => {},
  });
  beforeLoad?.(document);
  vm.runInContext(inlineScript(html), dom.getInternalVMContext());
  function select(
    start: Node,
    startOffset: number,
    end: Node,
    endOffset: number,
  ) {
    const range = document.createRange();
    range.setStart(start, startOffset);
    range.setEnd(end, endOffset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new window.Event('selectionchange'));
    lastTimer();
    return JSON.parse(postMessage.mock.calls.at(-1)?.[0] as string).info;
  }
  return { document, select, postMessage, close: () => window.close() };
}

test('manual WebView images are inert before insertion and load individually on tap', async () => {
  mockImageLoadingMode = 'manual';
  const first = 'https://example.com/actual.png';
  const { html } = await renderPage({
    variant: 'daily',
    htmlContent: `<p><picture><source srcset="https://example.com/big.png 2x"><img alt="第一张" src="https://example.com/thumb.png" srcset="https://example.com/large.png 2x" data-actualsrc="${first}" data-rawwidth="640" data-rawheight="480"></picture></p><img data-original-src="https://example.com/other.png"><img class="avatar" src="https://example.com/avatar.png"><img eeimg="1" src="https://example.com/math.png">`,
  });
  const insertedSources: string[] = [];
  const { document, postMessage, close } = selectionRuntime(
    html,
    undefined,
    (doc) => {
      const container = doc.getElementById('content');
      if (!container) throw new Error('Missing content');
      const append = container.appendChild.bind(container);
      jest.spyOn(container, 'appendChild').mockImplementation((child) => {
        if (child.nodeType === child.DOCUMENT_FRAGMENT_NODE) {
          for (const img of (child as DocumentFragment).querySelectorAll(
            'img[src], [srcset]',
          )) {
            insertedSources.push(
              img.getAttribute('src') ?? img.getAttribute('srcset') ?? '',
            );
          }
        }
        return append(child);
      });
    },
  );
  try {
    expect(insertedSources).toEqual([
      'https://example.com/avatar.png',
      'https://example.com/math.png',
    ]);
    expect(document.querySelectorAll('button')).toHaveLength(2);
    const button = document.querySelector('button');
    if (!button) throw new Error('Missing load button');
    button.click();
    expect(
      document.querySelector('img[alt="第一张"]')?.getAttribute('src'),
    ).toBe(first);
    expect(document.querySelectorAll('button')).toHaveLength(1);
    expect(document.querySelector('[srcset]')).toBeNull();
    document.querySelector('button')?.click();
    expect(
      document.querySelector('img[src="https://example.com/other.png"]'),
    ).not.toBeNull();
    expect(postMessage).not.toHaveBeenCalledWith(
      bridgeMessage(html, { type: 'image', src: first }),
    );
    document.querySelector<HTMLImageElement>('img[alt="第一张"]')?.click();
    expect(postMessage).toHaveBeenCalledWith(
      bridgeMessage(html, { type: 'image', src: first }),
    );
  } finally {
    close();
  }
});

test('maps styled and element boundaries to the original UTF-16 text within and across paragraphs', async () => {
  const { html } = await renderPage({
    htmlContent:
      '<p data-pid="one"><span>甲</span><strong>乙😀 </strong></p><blockquote><p data-pid="two"><a href="https://example.com"> 丙丁</a></p></blockquote>',
  });
  const { document, select, close } = selectionRuntime(html);
  try {
    const paragraphs = document.querySelectorAll('p');
    const first = paragraphs[0];
    const lastText = document.querySelector('p a')?.firstChild;
    const bold = first.querySelector('strong')?.firstChild;
    if (!bold || !lastText) throw new Error('Expected selectable text');
    expect(select(first, 1, bold, 3)).toEqual({
      text: '乙😀',
      startParagraphId: 'one',
      endParagraphId: 'one',
      startOffset: 1,
      endOffset: 4,
    });
    expect(select(bold, 1, lastText, 2)).toEqual({
      text: '😀 \n 丙',
      startParagraphId: 'one',
      endParagraphId: 'two',
      startOffset: 2,
      endOffset: 2,
    });
    expect(select(bold, 2, bold, 3)).toBeNull();
    expect(select(bold, 0, document.body, 1)).toBeNull();
  } finally {
    close();
  }
});

test('rejects ranges with ambiguous paragraph IDs, media boundaries and rewritten source offsets', async () => {
  const { html } = await renderPage({
    htmlContent: [
      '<p data-pid="begin">开始</p><figure><img src="https://example.com/a.jpg"></figure><p data-pid="afterMedia">后面</p>',
      '<p data-pid="dupe">同名</p><p data-pid="dupe">重复</p>',
      '<p data-pid="foot"><sup data-numero="1" data-text="说明">[1]</sup>脚注后</p>',
      '<p data-pid="image">开头<img src="https://example.com/a.jpg">结尾</p>',
      '<p data-pid="math">$x$ 公式后</p>',
    ].join(''),
  });
  const { document, select, close } = selectionRuntime(html, (container) => {
    const math = container.querySelector('[data-pid="math"]');
    if (math) math.innerHTML = '<span class="katex">x</span> 公式后';
  });
  function paragraph(pid: string) {
    const node = document.querySelector(`p[data-pid="${pid}"]`);
    if (!node?.firstChild || !node.lastChild)
      throw new Error('Expected test paragraph');
    return { first: node.firstChild, last: node.lastChild };
  }
  try {
    expect(
      select(paragraph('begin').first, 0, paragraph('afterMedia').last, 2),
    ).toBeNull();
    for (const pid of ['dupe', 'foot', 'math']) {
      const { last } = paragraph(pid);
      expect(select(last, 0, last, 2)).toBeNull();
    }
    const image = paragraph('image');
    expect(select(image.first, 0, image.last, 2)).toBeNull();
  } finally {
    close();
  }
});

test('only accepts exact unique API source text and treats hidden content as a selection boundary', async () => {
  const { html } = await renderPage({
    htmlContent: [
      '<p data-pid="start">起点</p>',
      '<p data-pid="stale">甲乙</p>',
      '<p data-pid="end">终点</p>',
      '<p data-pid="duplicate">同段</p>',
      '<p data-pid="hiddenInline">甲<span style="display: none !important">隐藏</span>乙</p>',
      '<p data-pid="beforeHidden">前段</p>',
      '<div style="display:none"><p data-pid="hiddenBlock">隐藏段落</p></div>',
      '<p data-pid="last">末尾</p>',
    ].join(''),
    segmentSourceTexts: JSON.stringify([
      ['start', '起点'],
      ['stale', '前甲乙'],
      ['duplicate', '同段'],
      ['duplicate', '同段'],
    ]),
  });
  const { document, select, close } = selectionRuntime(html);
  function text(pid: string, end = false) {
    const paragraph = document.querySelector(`p[data-pid="${pid}"]`);
    const node = end ? paragraph?.lastChild : paragraph?.firstChild;
    if (!node) throw new Error('Expected paragraph source text');
    return node;
  }
  try {
    for (const pid of ['start', 'end', 'last'])
      expect(select(text(pid), 0, text(pid), 2)).toMatchObject({
        startParagraphId: pid,
        endOffset: 2,
      });
    for (const pid of ['stale', 'duplicate', 'hiddenBlock'])
      expect(select(text(pid), 0, text(pid), 2)).toBeNull();
    expect(
      select(text('hiddenInline'), 0, text('hiddenInline', true), 1),
    ).toBeNull();
    expect(select(text('start'), 0, text('end'), 2)).toBeNull();
    expect(select(text('beforeHidden'), 0, text('last'), 2)).toBeNull();
  } finally {
    close();
  }
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

test.each([true, false])(
  'keeps a comment icon inside a link independently tappable (segment taps %s)',
  async (segmentTapEnabled) => {
    const { html } = await renderPage({
      htmlContent:
        '<p data-pid="p"><a href="https://example.com/"><span class="segment-interactable segment-comments" data-pid="p" data-segment-node-id="n">链接文字</span></a></p>',
      segmentTapEnabled,
    });
    const { document, select, postMessage, close } = selectionRuntime(html);
    try {
      const span = document.querySelector<HTMLElement>('.segment-comments');
      const icon = span?.querySelector<HTMLElement>('.segment-comment-icon');
      if (!span?.firstChild || !icon) throw new Error('Expected linked marker');
      expect(span.textContent).toBe('链接文字');
      expect(
        select(span.firstChild, 0, span, span.childNodes.length),
      ).toMatchObject({
        text: '链接文字',
        startOffset: 0,
        endOffset: 4,
      });
      postMessage.mockClear();
      icon.click();
      expect(postMessage.mock.calls).toEqual(
        segmentTapEnabled
          ? [[bridgeMessage(html, { type: 'segment', pid: 'p', nodeId: 'n' })]]
          : [],
      );
      span.click();
      expect(postMessage).toHaveBeenLastCalledWith(
        bridgeMessage(html, { type: 'link', href: 'https://example.com/' }),
      );
    } finally {
      close();
    }
  },
);

test.each([true, false])(
  'honors segment taps = %s and preserves links within a marked passage',
  async (segmentTapEnabled) => {
    const { html, props } = await renderPage({ segmentTapEnabled });
    const postMessage = jest.fn();
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
      window: {
        ReactNativeWebView: { postMessage },
        addEventListener: jest.fn(),
      },
      setTimeout: jest.fn(),
    });
    const click = container.addEventListener.mock.calls.find(
      ([event]) => event === 'click',
    )?.[1];
    const span = {
      tagName: 'SPAN',
      parentElement: container,
      classList: {
        contains: (name: string) => name === 'segment-interactable',
      },
      getAttribute: (name: string) => (name === 'data-pid' ? 'p' : 'n'),
    };
    click({ target: span });
    expect(postMessage).toHaveBeenCalledTimes(segmentTapEnabled ? 1 : 0);
    const segmentMessage = bridgeMessage(html, {
      type: 'segment',
      pid: 'p',
      nodeId: 'n',
    });
    if (segmentTapEnabled)
      expect(postMessage).toHaveBeenCalledWith(segmentMessage);
    await act(() =>
      mockWebViewProps.onMessage?.({
        nativeEvent: { data: segmentMessage },
      } as Parameters<NonNullable<WebViewProps['onMessage']>>[0]),
    );
    expect(props.onSegmentPress).toHaveBeenCalledTimes(
      segmentTapEnabled ? 1 : 0,
    );
    const link = {
      tagName: 'A',
      classList: { contains: () => false },
      getAttribute: () => 'https://example.com/',
      parentElement: container,
    };
    click({
      target: { ...span, parentElement: link },
      preventDefault: jest.fn(),
    });
    expect(postMessage).toHaveBeenLastCalledWith(
      bridgeMessage(html, { type: 'link', href: 'https://example.com/' }),
    );
  },
);
