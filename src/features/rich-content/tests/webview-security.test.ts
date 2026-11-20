import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isTag, type Node } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';
import { compileZhihuDocument } from '../compileRichText';
import type { ZhihuDocument } from '../document';
import { serializeZhihuDocumentHtml } from '../documentHtml';
import { getWebViewSegmentParagraphs } from '../nativeInteractions';
import { normalizeZhihuDocument } from '../normalization/normalizeZhihuDocument';
import {
  getSafeRichContentUrl,
  sanitizeRichContentHtml,
  serializeInlineScriptValue,
} from '../webviewSecurity';

function elements(nodes: readonly Node[]) {
  return nodes.flatMap((node): ReturnType<typeof parseDocument>['children'] =>
    isTag(node) ? [node, ...elements(node.children)] : [],
  );
}

test('webview keeps blank paragraphs without classifying prose, media or multiple breaks as empty', () => {
  const html =
    '<p class="ztext-empty-paragraph"><br></p><p> </p><p></p>' +
    '<p class="zhihu-empty-paragraph">正文</p><p><br><br></p>' +
    '<p><img src="https://example.com/image.png"></p><p><br></p>';
  const sanitized = sanitizeRichContentHtml(html);
  const paragraphs = elements(parseDocument(sanitized).children)
    .filter(isTag)
    .filter((node) => node.name === 'p');
  expect(paragraphs).toHaveLength(7);
  expect(
    paragraphs.map((node) =>
      (node.attribs.class ?? '').split(/\s+/).includes('zhihu-empty-paragraph'),
    ),
  ).toEqual([true, true, true, false, false, false, true]);
  expect(sanitizeRichContentHtml(sanitized)).toBe(sanitized);
  expect(sanitized).not.toContain('\u200b');
});

test('document HTML roundtrips blank counts for the fallback renderer', () => {
  const { document } = normalizeZhihuDocument(
    '<p data-pid="blank"><br></p><p><br></p><p>正文</p><p><br></p>',
    { documentId: 'empty-roundtrip' },
  );
  const html = serializeZhihuDocumentHtml(document);
  const roundtrip = normalizeZhihuDocument(sanitizeRichContentHtml(html), {
    documentId: 'empty-roundtrip',
  }).document;
  expect(roundtrip.blocks.map((block) => block.type)).toEqual(
    document.blocks.map((block) => block.type),
  );
  expect(
    roundtrip.blocks.map(
      (block) => block.type === 'paragraph' && !!block.empty,
    ),
  ).toEqual([true, true, false, true]);
  expect(roundtrip.blocks[0]).toMatchObject({ paragraphId: 'blank' });
});

test('stored video markup retains its cover and uses native player links or an unavailable label', () => {
  const fixture = JSON.parse(
    readFileSync(
      path.join(__dirname, '../fixtures/cases/video-playback-001.json'),
      'utf8',
    ),
  ) as { content: string };
  const sanitized = sanitizeRichContentHtml(fixture.content);
  const nodes = elements(parseDocument(sanitized).children).filter(isTag);
  expect(
    nodes.some((node) => ['video', 'source', 'iframe'].includes(node.name)),
  ).toBe(false);
  expect(
    nodes.filter((node) => node.name === 'a').map((node) => node.attribs.href),
  ).toEqual([
    'zhihu--:///video/101?source=lens',
    'zhihu--:///video/303?source=lens',
    'zhihu--:///video/direct?source=direct&uri=https%3A%2F%2Fexample.com%2Fsynthetic.mp4',
  ]);
  expect(sanitized.match(/播放视频/g)).toHaveLength(3);
  expect(sanitized.match(/视频不可用/g)).toHaveLength(2);
  expect(
    nodes.filter((node) => node.name === 'img').map((node) => node.attribs),
  ).toEqual([
    {
      class: 'zhihu-video-cover',
      src: 'https://example.com/poster.png',
      alt: '视频封面',
    },
  ]);
});

test('video covers prefer poster and lazy thumbnail resources without retaining image actions or unsafe markup', () => {
  const sanitized = sanitizeRichContentHtml(
    '<video data-lens-id="101" poster="//example.com/poster.png" title="封面&lt;测试&gt;" onplay="throw 1"><img src="https://example.com/ignored.png"></video>' +
      '<a class="video-box" data-lens-id="102"><span><img src="https://example.com/placeholder.png" data-actualsrc="https://example.com/actual.png" data-preview-src="https://example.com/preview.png" onerror="throw 1"></span></a>' +
      '<a class="video-box" data-lens-id="103"><img data-original="https://example.com/original.png"></a>' +
      '<video data-lens-id="104" poster="javascript:throw 1"></video>' +
      '<a class="video-box" href="https://example.com/page"><img src="https://example.com/unavailable.png"></a>',
  );
  const nodes = elements(parseDocument(sanitized).children).filter(isTag);
  const images = nodes.filter((node) => node.name === 'img');
  expect(images.map((node) => node.attribs.src)).toEqual([
    'https://example.com/poster.png',
    'https://example.com/actual.png',
    'https://example.com/original.png',
    'https://example.com/unavailable.png',
  ]);
  expect(images[0].attribs.alt).toBe('封面<测试>');
  expect(
    images.every((image) =>
      Object.keys(image.attribs).every((name) =>
        ['class', 'src', 'alt'].includes(name),
      ),
    ),
  ).toBe(true);
  expect(sanitized).not.toContain('javascript:');
  expect(sanitized).not.toContain('onerror');
  expect(sanitized).not.toContain('onplay');
  expect(nodes.at(-3)?.name).toBe('div');
  expect(nodes.at(-3)?.attribs.href).toBeUndefined();
});

test('serialized videos share native playback routing and never link an unsupported webpage', () => {
  const document: ZhihuDocument = {
    id: 'video-document',
    blocks: [
      {
        id: 'lens',
        type: 'video',
        lensId: '101',
        videoId: '202',
        url: 'https://www.zhihu.com/zvideo/202',
        poster: { mediaType: 'image', url: 'https://example.com/cover.png' },
        title: '示例视频',
      },
      {
        id: 'direct',
        type: 'video',
        url: '',
        resource: {
          mediaType: 'video',
          url: 'https://example.com/synthetic.mp4',
        },
      },
      { id: 'unavailable', type: 'video', url: 'https://example.com/page' },
    ],
  };
  const html = sanitizeRichContentHtml(serializeZhihuDocumentHtml(document));
  const links = elements(parseDocument(html).children).filter(
    (node) => isTag(node) && node.name === 'a',
  );
  expect(links.filter(isTag).map((node) => node.attribs.href)).toEqual([
    'zhihu--:///video/101?source=lens&title=%E7%A4%BA%E4%BE%8B%E8%A7%86%E9%A2%91',
    'zhihu--:///video/direct?source=direct&uri=https%3A%2F%2Fexample.com%2Fsynthetic.mp4',
  ]);
  expect(html).toContain('视频不可用');
  const images = elements(parseDocument(html).children)
    .filter((node) => isTag(node) && node.name === 'img')
    .filter(isTag);
  expect(images).toHaveLength(1);
  expect(images[0].attribs).toEqual({
    class: 'zhihu-video-cover',
    src: 'https://example.com/cover.png',
    alt: '示例视频',
  });
});

test('script serialization preserves content without exposing HTML delimiters', () => {
  const value = '</script><script>throw 1</script><!--&\u2028\u2029';
  const serialized = serializeInlineScriptValue(value);
  expect(serialized).not.toMatch(/[<>&\u2028\u2029]/);
  expect(JSON.parse(serialized)).toBe(value);
});

test('the registered synthetic fixture removes executable nodes, handlers and URLs while retaining content semantics', () => {
  const fixture = JSON.parse(
    readFileSync(
      path.join(
        __dirname,
        '../fixtures/cases/webview-untrusted-content-001.json',
      ),
      'utf8',
    ),
  ) as { content: string };
  const sanitized = sanitizeRichContentHtml(fixture.content);
  const nodes = elements(parseDocument(sanitized).children).filter(isTag);
  expect(nodes.map((node) => node.name)).toEqual([
    'p',
    'strong',
    'img',
    'a',
    'sup',
  ]);
  expect(nodes[0].attribs).toEqual({
    'data-pid': 'synthetic-paragraph',
    style: 'color: red',
  });
  expect(nodes[2].attribs).toEqual({ src: 'https://example.com/image.png' });
  expect(nodes[3].attribs.href).toBeUndefined();
  expect(nodes[4].attribs['data-text']).toBe('<img src=x onerror="throw 1">');
  expect(sanitized).toContain('<strong>保留格式</strong>');
});

test.each([
  'javascript:throw 1',
  'java\nscript:throw 1',
  'data:text/html,<script>throw 1</script>',
  'file:///private/example',
  'https://user:password@example.com/image.png',
  'https://link.zhihu.com/?target=javascript%3Athrow%201',
])('rejects an unsafe content URL %s', (url) => {
  expect(getSafeRichContentUrl(url)).toBeUndefined();
  const [reference] = parseDocument(
    sanitizeRichContentHtml(`<sup data-numero="1" data-url="${url}">1</sup>`),
  ).children;
  expect(isTag(reference) && reference.attribs['data-url']).toBeUndefined();
});

test('keeps safe links, resources and inert image data while validating redirect destinations', () => {
  expect(getSafeRichContentUrl('/question/1')).toBe(
    'https://www.zhihu.com/question/1',
  );
  expect(getSafeRichContentUrl('zhihu://answers/1')).toBe('zhihu://answers/1');
  expect(
    getSafeRichContentUrl(
      'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2F',
    ),
  ).toBe('https://example.com/');
  expect(getSafeRichContentUrl('//example.com/image.png', true)).toBe(
    'https://example.com/image.png',
  );
  expect(getSafeRichContentUrl('data:image/png;base64,AA==', true)).toBe(
    'data:image/png;base64,AA==',
  );
  expect(getSafeRichContentUrl('data:image/png;base64,AA==')).toBeUndefined();
  expect(getSafeRichContentUrl('zhihu://answers/1', true)).toBeUndefined();
  const originalHref =
    'https://link.zhihu.com/?target=https%3A%2F%2Fexample.com%2F';
  const anchor = parseDocument(
    sanitizeRichContentHtml(`<a href="${originalHref}">卡片</a>`),
  ).children[0];
  expect(isTag(anchor) && anchor.attribs.href).toBe(originalHref);
});

test('unwraps unknown HTML containers and prevents foreign namespace mutation or CSS resource loads', () => {
  const sanitized = sanitizeRichContentHtml(
    '<custom><p style="color:red;background-color:url(https://example.com);font-size:18px" onclick="throw 1">文字</p></custom><svg><foreignObject><p onclick="throw 1">隐藏内容</p></foreignObject></svg><math><mtext><img src=x onerror="throw 1"></mtext></math>',
  );
  expect(sanitized).toBe('<p style="color:red;font-size:18px">文字</p>');
});

test('semantic documents retain text, paragraph identity and media protocols without exposing executable HTML or reaction metadata', () => {
  const paragraphId = '真实段落"><script>throw 1</script>';
  const segmentNodeId = 'segment"><script>throw 1</script>';
  const text = '文字 < & > "\'\n第二行🌿 $a$ \\(字面量\\) \\[仍是文字\\]';
  const latex = 'x < y \\text{& "值"}';
  const document: ZhihuDocument = {
    id: 'synthetic-document',
    blocks: [
      {
        id: 'node-paragraph',
        type: 'paragraph',
        paragraphId,
        children: [
          { id: 'text', type: 'text', text },
          {
            id: segmentNodeId,
            type: 'segment',
            paragraphId,
            range: { start: text.length, end: text.length + 2 },
            segInfo: {
              seg_ids: ['private-reaction-metadata"><script>throw 1</script>'],
              like_count: 1,
              comment_count: 0,
              my_comment_count: 0,
              is_like: true,
            },
            children: [
              {
                id: 'strong',
                type: 'strong',
                children: [{ id: 'strong-text', type: 'text', text: '粗体' }],
              },
            ],
          },
          {
            id: 'segment-link',
            type: 'segment',
            paragraphId,
            range: { start: text.length + 2, end: text.length + 6 },
            children: [
              {
                id: 'link',
                type: 'link',
                url: '/question/1?text=%3Cscript%3E&value=1',
                children: [{ id: 'link-text', type: 'text', text: '安全链接' }],
              },
            ],
          },
          {
            id: 'unsafe-link',
            type: 'link',
            url: 'javascript:throw 1',
            children: [
              { id: 'unsafe-link-text', type: 'text', text: '保留链接文字' },
            ],
          },
        ],
      },
      {
        id: 'formula-paragraph',
        type: 'paragraph',
        paragraphId: 'mixed-formula-pid',
        children: [
          {
            id: 'mixed-segment',
            type: 'segment',
            paragraphId: 'mixed-formula-pid',
            range: { start: 0, end: 1 },
            children: [
              { id: 'formula', type: 'inlineFormula', formula: { latex } },
            ],
          },
        ],
      },
      {
        id: 'first-duplicate',
        type: 'paragraph',
        paragraphId: 'duplicate-pid',
        children: [{ id: 'duplicate-one', type: 'text', text: '重复一' }],
      },
      {
        id: 'second-duplicate',
        type: 'paragraph',
        paragraphId: 'duplicate-pid',
        children: [{ id: 'duplicate-two', type: 'text', text: '重复二' }],
      },
      {
        id: 'unsupported-paragraph',
        type: 'paragraph',
        paragraphId: 'mixed-unsupported-pid',
        children: [
          {
            id: 'unsupported-inline',
            type: 'unsupported',
            sourceType: 'unknown',
            fallbackText: '保留行内文字',
          },
        ],
      },
      {
        id: 'heading',
        type: 'heading',
        level: 2,
        paragraphId: 'heading-pid',
        children: [{ id: 'heading-text', type: 'text', text: '标题<&' }],
      },
      {
        id: 'list',
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          {
            id: 'list-item',
            blocks: [
              {
                id: 'list-paragraph',
                type: 'paragraph',
                paragraphId: 'list-pid',
                children: [{ id: 'list-text', type: 'text', text: '列表文字' }],
              },
            ],
          },
        ],
      },
      {
        id: 'small-image',
        type: 'image',
        layout: 'small',
        resource: {
          mediaType: 'image',
          url: '//example.com/image.png',
          width: 320,
          height: 240,
        },
        alt: '图片"><script>throw 1</script>',
        caption: [{ id: 'caption', type: 'text', text: '图注 < &\n新行' }],
      },
      {
        id: 'normal-image',
        type: 'image',
        layout: 'normal',
        resource: {
          mediaType: 'image',
          url: 'https://example.com/full.png',
          width: Number.NaN,
          height: Number.POSITIVE_INFINITY,
        },
      },
      {
        id: 'unsafe-image',
        type: 'image',
        resource: { mediaType: 'image', url: 'javascript:throw 1' },
        alt: '保留图片替代文字 < &',
      },
      {
        id: 'image-formula',
        type: 'blockFormula',
        formula: {
          image: { mediaType: 'image', url: 'https://example.com/formula.png' },
        },
      },
      { id: 'divider', type: 'divider' },
      {
        id: 'unsupported',
        type: 'unsupported',
        sourceType: '<script>throw 1</script>',
        fallbackText: '未知结构 <script>保留文字</script> &\n下一行',
      },
    ],
  };
  const html = serializeZhihuDocumentHtml(document);
  const sanitized = sanitizeRichContentHtml(html);
  const nodes = elements(parseDocument(sanitized).children).filter(isTag);
  const paragraph = nodes.find(
    (node) => node.attribs['data-pid'] === paragraphId,
  );
  expect(paragraph?.name).toBe('p');
  expect(paragraph && DomUtils.textContent(paragraph)).toBe(
    `${text}粗体安全链接保留链接文字`,
  );
  expect(paragraph?.attribs.style).toBe('white-space:pre-wrap');
  expect(
    nodes
      .filter((node) => node.attribs.class === 'zhihu-literal-text')
      .map((node) => DomUtils.textContent(node)),
  ).toEqual([text]);
  expect(
    nodes.filter((node) => node.name === 'p' && node.attribs['data-pid']),
  ).toHaveLength(1);
  expect(
    nodes
      .filter((node) => node.attribs['data-segment-node-id'])
      .map((node) => node.attribs),
  ).toEqual([
    {
      class: 'segment-interactable segment-liked',
      'data-pid': paragraphId,
      'data-segment-node-id': segmentNodeId,
    },
    {
      class: 'segment-interactable',
      'data-pid': paragraphId,
      'data-segment-node-id': 'segment-link',
    },
  ]);
  expect(nodes.find((node) => node.name === 'strong')?.children).toHaveLength(
    1,
  );
  expect(nodes.find((node) => node.name === 'a')?.attribs.href).toBe(
    'https://www.zhihu.com/question/1?text=%3Cscript%3E&value=1',
  );
  expect(nodes.filter((node) => node.name === 'a')).toHaveLength(1);
  expect(nodes.find((node) => node.name === 'h2')?.children).toHaveLength(1);
  expect(nodes.find((node) => node.name === 'ol')?.attribs.start).toBe('3');
  expect(nodes.find((node) => node.name === 'li')).toBeDefined();
  const images = nodes.filter((node) => node.name === 'img');
  expect(images.map((image) => image.attribs)).toEqual([
    { eeimg: '1', alt: latex },
    {
      src: 'https://example.com/image.png',
      alt: '图片"><script>throw 1</script>',
      'data-rawwidth': '320',
      'data-rawheight': '240',
      style: 'width:320px;max-width:100%',
    },
    { src: 'https://example.com/full.png', alt: '', style: 'width:100%' },
    { eeimg: '2', src: 'https://example.com/formula.png', alt: '' },
  ]);
  const plainText = DomUtils.textContent(parseDocument(sanitized));
  expect(plainText).toContain('图注 < &\n新行');
  expect(plainText).toContain('保留图片替代文字 < &');
  expect(plainText).toContain('未知结构 <script>保留文字</script> &\n下一行');
  expect(nodes.some((node) => node.name === 'hr')).toBe(true);
  expect(nodes.some((node) => node.name === 'script')).toBe(false);
  expect(html).not.toContain('private-reaction-metadata');
  expect(html).not.toMatch(/javascript:|NaN|Infinity/);
  expect(JSON.parse(serializeInlineScriptValue(sanitized))).toBe(sanitized);
});

test('marks the exact end of a commented source range across formatted WebView text leaves', () => {
  const html =
    '<p data-pid="one">前<b>甲<i>😀</i></b><a href="/people/u">乙后</a><span class="highlight-wrap" data-highlight-comment-count="0">零</span><span class="highlight-wrap">未知</span></p>';
  const { document } = normalizeZhihuDocument(html, {
    documentId: 'answer:42',
    segmentInfos: [
      {
        pid: 'one',
        text: '前甲😀乙后零未知',
        marks: [
          {
            start_index: 1,
            end_index: 5,
            seg_info: { is_like: false, like_count: 1, comment_count: 2 },
          },
        ],
      },
    ],
  });
  for (const serialized of [
    sanitizeRichContentHtml(html, getWebViewSegmentParagraphs(document)),
    sanitizeRichContentHtml(
      serializeZhihuDocumentHtml(document),
      getWebViewSegmentParagraphs(document),
    ),
  ]) {
    const nodes = parseDocument(serialized).children;
    expect(DomUtils.textContent(nodes)).toBe('前甲😀乙后零未知');
    expect(
      DomUtils.findAll((node) => node.name === 'a', nodes)
        .map((link) => DomUtils.textContent(link))
        .join(''),
    ).toBe('乙后');
    const marked = DomUtils.findAll(
      (node) =>
        node.attribs.class?.split(' ').includes('segment-comments') === true,
      nodes,
    );
    expect(marked).toHaveLength(1);
    expect(DomUtils.textContent(marked[0])).toMatch(/乙$/);
  }
});

test.each([0, 2])(
  'uses the current API count %i for an exactly matching HTML underline',
  (count) => {
    const html =
      '<p data-pid="one"><span class="highlight-wrap" data-highlight-comment-count="1">范围</span></p>';
    const { document } = normalizeZhihuDocument(html, {
      documentId: 'answer:42',
      segmentInfos: [
        {
          pid: 'one',
          text: '范围',
          marks: [
            {
              start_index: 0,
              end_index: 2,
              seg_info: { is_like: false, like_count: 1, comment_count: count },
            },
          ],
        },
      ],
    });
    const index = getWebViewSegmentParagraphs(document);
    for (const source of [html, serializeZhihuDocumentHtml(document)]) {
      const nodes = parseDocument(
        sanitizeRichContentHtml(source, index),
      ).children;
      const marked = DomUtils.findAll(
        (node) =>
          node.attribs.class?.split(' ').includes('segment-comments') === true,
        nodes,
      );
      expect(marked).toHaveLength(count > 0 ? 1 : 0);
    }
  },
);

test.each([0, 2])(
  'keeps a single terminal marker when an outer commented range and an inner range with %i comments end together',
  (innerCount) => {
    const html = `<p data-pid="one"><span class="highlight-wrap" data-highlight-comment-count="3">甲<span class="highlight-wrap" data-highlight-comment-count="${innerCount}">乙</span></span></p>`;
    const { document } = normalizeZhihuDocument(html, {
      documentId: 'answer:42',
    });
    const paragraphs = getWebViewSegmentParagraphs(document);
    const range = paragraphs
      .get('one')
      ?.annotations.find((mark) => mark.start === (innerCount ? 1 : 0));
    expect(range?.run.id).toBeDefined();
    for (const source of [html, serializeZhihuDocumentHtml(document)]) {
      const nodes = parseDocument(
        sanitizeRichContentHtml(source, paragraphs),
      ).children;
      const marked = DomUtils.findAll(
        (node) =>
          node.attribs.class?.split(' ').includes('segment-comments') === true,
        nodes,
      );
      expect(marked).toHaveLength(1);
      expect(marked[0].attribs['data-segment-node-id']).toBe(range?.run.id);
      expect(DomUtils.textContent(marked[0])).toBe('乙');
    }
    const part = compileZhihuDocument(document, {
      fontSize: 17,
      lineHeight: 26,
    }).parts[0];
    if (part.type !== 'flow') throw new Error('Expected flow');
    expect(
      part.flow.decorations
        .filter((decoration) => decoration.hasComments)
        .map((decoration) => decoration.nodeId),
    ).toEqual([range?.run.id]);
  },
);
